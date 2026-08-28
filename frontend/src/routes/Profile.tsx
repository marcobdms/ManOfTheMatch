import { useEffect, useState } from 'react'
import { Bell, BellRinging, Check } from '@phosphor-icons/react'
import AppHeader from '../components/AppHeader'
import { useTeams } from '../lib/queries'
import { disablePush, enablePush, getPushStatus, syncPushProfile, type PushStatus } from '../lib/push'
import {
  getStoredFavoriteTeam,
  getStoredPrefs,
  setStoredFavoriteTeam,
  setStoredPrefs,
  type PushPrefs,
} from '../lib/favorite'

const PREF_ROWS: Array<{ key: keyof PushPrefs; label: string; note: string }> = [
  { key: 'matchday', label: 'Hoy hay partido', note: 'Aviso la mañana del partido' },
  { key: 'kickoff', label: 'Empieza pronto', note: '15 minutos antes del pitido inicial' },
  { key: 'lineup', label: 'Alineación', note: 'En cuanto se confirma el once inicial' },
  { key: 'goals', label: 'Goles', note: 'De tu equipo y del rival' },
]

const PUSH_EXPLAINER: Partial<Record<PushStatus, string>> = {
  'needs-install':
    'Añade ManOfTheMatch a la pantalla de inicio (Compartir → Añadir a pantalla de inicio) y ábrela desde ahí para poder activar avisos.',
  denied: 'Has bloqueado las notificaciones. Actívalas en los ajustes del navegador.',
  unsupported: 'Este dispositivo no admite notificaciones push.',
  'no-vapid': 'Las notificaciones aún no están configuradas en este entorno.',
}

export default function Profile() {
  const teamsQuery = useTeams()
  const [favoriteTeamId, setFavoriteTeamId] = useState<string | null>(() => getStoredFavoriteTeam())
  const [prefs, setPrefs] = useState<PushPrefs>(() => getStoredPrefs())
  const [pushStatus, setPushStatus] = useState<PushStatus | null>(null)
  const [pushBusy, setPushBusy] = useState(false)

  useEffect(() => {
    let alive = true
    getPushStatus()
      .then((status) => alive && setPushStatus(status))
      .catch(() => alive && setPushStatus('unsupported'))
    return () => {
      alive = false
    }
  }, [])

  const pushEnabled = pushStatus === 'enabled'

  function pickFavorite(teamId: string) {
    const next = teamId === favoriteTeamId ? null : teamId
    setFavoriteTeamId(next)
    setStoredFavoriteTeam(next)
    void syncPushProfile(next, prefs)
  }

  function togglePref(key: keyof PushPrefs) {
    const next = { ...prefs, [key]: !prefs[key] }
    setPrefs(next)
    setStoredPrefs(next)
    void syncPushProfile(favoriteTeamId, next)
  }

  async function toggleBell() {
    if (pushBusy) return
    setPushBusy(true)
    try {
      setPushStatus(pushEnabled ? await disablePush() : await enablePush())
    } catch {
      setPushStatus(await getPushStatus())
    } finally {
      setPushBusy(false)
    }
  }

  return (
    <>
      <AppHeader />
      <div className="motm-profile">
        <h1 className="motm-profile__title">Perfil</h1>

        <section>
          <h2 className="motm-label motm-profile__h2">Equipo favorito</h2>
          <p className="motm-note motm-profile__hint">
            Recibirás sus avisos en este dispositivo — sin cuenta, sin contraseña.
          </p>
          {teamsQuery.isLoading && <div className="motm-skel" style={{ height: 240 }} aria-hidden="true" />}
          {teamsQuery.data && (
            <ul className="motm-team-list">
              {teamsQuery.data.map((t) => {
                const active = t.id === favoriteTeamId
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      className={'motm-team-row' + (active ? ' is-active' : '')}
                      aria-pressed={active}
                      onClick={() => pickFavorite(t.id)}
                    >
                      <span
                        className="motm-team-row__swatch"
                        style={{ background: t.primary_color ?? 'var(--muted)' }}
                      >
                        {t.tla}
                      </span>
                      <span className="motm-team-row__name">{t.short_name}</span>
                      {active && <Check size={18} weight="bold" className="motm-team-row__check" />}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section>
          <div className="motm-profile__notif-head">
            <h2 className="motm-label motm-profile__h2">Notificaciones</h2>
            <button
              type="button"
              className="motm-btn motm-btn--icon"
              aria-pressed={pushEnabled}
              aria-label={pushEnabled ? 'Desactivar notificaciones' : 'Activar notificaciones'}
              aria-busy={pushBusy}
              disabled={pushBusy}
              onClick={toggleBell}
            >
              {pushEnabled ? <BellRinging size={20} /> : <Bell size={20} />}
            </button>
          </div>

          {pushStatus && PUSH_EXPLAINER[pushStatus] && (
            <p className="motm-note" role="note">
              {PUSH_EXPLAINER[pushStatus]}
            </p>
          )}

          <ul className="motm-pref-list">
            {PREF_ROWS.map((row) => (
              <li key={row.key} className="motm-pref-row">
                <div>
                  <div className="motm-pref-row__label">{row.label}</div>
                  <div className="motm-pref-row__note">{row.note}</div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={prefs[row.key]}
                  className={'motm-switch' + (prefs[row.key] ? ' is-on' : '')}
                  onClick={() => togglePref(row.key)}
                >
                  <span className="motm-switch__thumb" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  )
}
