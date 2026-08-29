import { useEffect, useState } from 'react'
import { Bell, BellRinging, Check } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import AppHeader from '../components/AppHeader'
import { StaggerItem, StaggerList } from '../components/StaggerList'
import TeamCrest from '../components/TeamCrest'
import { useTeams } from '../lib/queries'
import { disablePush, enablePush, getPushStatus, syncPushProfile, type PushStatus } from '../lib/push'
import { signOut } from '../lib/auth'
import { useAuth, type PushPrefs } from '../lib/AuthProvider'

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

/** Sin sesión: invitación a entrar o registrarse — no hay favorito sin cuenta. */
function SignedOutProfile() {
  return (
    <>
      <AppHeader />
      <div className="motm-profile">
        <h1 className="motm-profile__title">Perfil</h1>
        <div className="motm-auth__banner" role="status">
          <b>Necesitas una cuenta</b>
          Entra o regístrate para elegir tu equipo favorito y recibir sus avisos.
        </div>
        <div className="motm-auth__form">
          <Link className="motm-btn motm-auth__submit" to="/entrar">
            Entrar
          </Link>
          <Link className="motm-btn motm-btn--muted motm-auth__submit" to="/registro">
            Crear cuenta
          </Link>
        </div>
      </div>
    </>
  )
}

export default function Profile() {
  const { session, profile, profileLoading, updateProfile } = useAuth()
  const teamsQuery = useTeams()
  const [pushStatus, setPushStatus] = useState<PushStatus | null>(null)
  const [pushBusy, setPushBusy] = useState(false)
  const [savingFavorite, setSavingFavorite] = useState(false)

  useEffect(() => {
    let alive = true
    getPushStatus()
      .then((status) => alive && setPushStatus(status))
      .catch(() => alive && setPushStatus('unsupported'))
    return () => {
      alive = false
    }
  }, [])

  if (!session) return <SignedOutProfile />

  const favoriteTeamId = profile?.favorite_team_id ?? null
  const prefs = profile?.prefs
  const pushEnabled = pushStatus === 'enabled'

  async function pickFavorite(teamId: string) {
    if (savingFavorite) return
    const next = teamId === favoriteTeamId ? null : teamId
    setSavingFavorite(true)
    try {
      await updateProfile({ favorite_team_id: next })
      void syncPushProfile(session!.user.id, next, prefs ?? { matchday: true, kickoff: true, lineup: true, goals: true })
    } finally {
      setSavingFavorite(false)
    }
  }

  async function togglePref(key: keyof PushPrefs) {
    if (!prefs) return
    const next = { ...prefs, [key]: !prefs[key] }
    await updateProfile({ prefs: next })
    void syncPushProfile(session!.user.id, favoriteTeamId, next)
  }

  async function toggleBell() {
    if (pushBusy) return
    setPushBusy(true)
    try {
      setPushStatus(
        pushEnabled
          ? await disablePush()
          : await enablePush(session!.user.id, favoriteTeamId, prefs ?? { matchday: true, kickoff: true, lineup: true, goals: true }),
      )
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
        <p className="motm-note motm-profile__hint">
          {profile?.display_name ? `${profile.display_name} · ` : ''}
          {session.user.email}
        </p>

        <section>
          <h2 className="motm-label motm-profile__h2">Equipo favorito</h2>
          <p className="motm-note motm-profile__hint">Recibirás sus avisos en este dispositivo.</p>
          {(teamsQuery.isLoading || profileLoading) && (
            <div className="motm-skel" style={{ height: 240 }} aria-hidden="true" />
          )}
          {teamsQuery.data && !profileLoading && (
            <StaggerList className="motm-team-list">
              {teamsQuery.data.map((t) => {
                const active = t.id === favoriteTeamId
                return (
                  <StaggerItem key={t.id}>
                    <button
                      type="button"
                      className={'motm-team-row' + (active ? ' is-active' : '')}
                      aria-pressed={active}
                      disabled={savingFavorite}
                      onClick={() => pickFavorite(t.id)}
                    >
                      <TeamCrest teamId={t.id} tla={t.tla} color={t.primary_color} size={32} />
                      <span className="motm-team-row__name">{t.short_name}</span>
                      {active && <Check size={18} weight="bold" className="motm-team-row__check" />}
                    </button>
                  </StaggerItem>
                )
              })}
            </StaggerList>
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

          {prefs && (
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
          )}
        </section>

        <button
          type="button"
          className="motm-btn motm-btn--muted motm-profile__signout"
          onClick={() => void signOut()}
        >
          Cerrar sesión
        </button>
      </div>
    </>
  )
}
