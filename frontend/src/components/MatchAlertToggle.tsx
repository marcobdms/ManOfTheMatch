import { useEffect, useState } from 'react'
import AnimatedBell from './AnimatedBell'
import { useAuth } from '../lib/AuthProvider'
import { isSubscribedToMatch, subscribeToMatch, unsubscribeFromMatch } from '../lib/matchAlerts'
import type { PushStatus } from '../lib/push'

/** Por qué no se pueden activar los avisos, en cristiano. `disabled` no está:
 *  ese caso lo resuelve el propio flujo pidiendo permiso al navegador. */
const EXPLAINER: Partial<Record<PushStatus, string>> = {
  'needs-install':
    'Para recibir avisos, añade ManOfTheMatch a la pantalla de inicio (Compartir → Añadir a pantalla de inicio) y ábrela desde ahí.',
  denied:
    'Tienes las notificaciones bloqueadas. Actívalas en los ajustes del navegador para recibir los avisos de este partido.',
  unsupported: 'Este dispositivo no admite notificaciones push.',
  'no-vapid': 'Las notificaciones aún no están configuradas en este entorno.',
}

/**
 * Interruptor de avisos de UN partido concreto (`match_subscriptions`, 0016),
 * independiente del equipo favorito.
 *
 * Un toque activa y otro desactiva, sin confirmación: es reversible en el
 * mismo botón, así que preguntar solo metía un paso de más.
 */
export default function MatchAlertToggle({ fixtureId }: { fixtureId: string | undefined }) {
  const { session, profile } = useAuth()
  const [on, setOn] = useState(false)
  const [busy, setBusy] = useState(false)
  const [blocked, setBlocked] = useState<PushStatus | null>(null)

  useEffect(() => {
    if (!fixtureId) return
    let alive = true
    const settle = (value: boolean) => {
      if (!alive) return
      setOn(value)
      setBlocked(null) // al cambiar de partido, fuera el aviso del anterior
    }
    isSubscribedToMatch(fixtureId)
      .then(settle)
      .catch(() => settle(false))
    return () => {
      alive = false
    }
  }, [fixtureId])

  async function enable() {
    if (!fixtureId || busy) return
    setBusy(true)
    try {
      const status = await subscribeToMatch(
        fixtureId,
        session?.user.id ?? null,
        profile?.favorite_team_id ?? null,
        profile?.prefs ?? { matchday: true, kickoff: true, lineup: true, goals: true },
      )
      setOn(status === 'enabled')
      setBlocked(status === 'enabled' ? null : status)
    } catch {
      setOn(await isSubscribedToMatch(fixtureId).catch(() => false))
    } finally {
      setBusy(false)
    }
  }

  async function disable() {
    if (!fixtureId || busy) return
    setBusy(true)
    try {
      await unsubscribeFromMatch(fixtureId)
      setOn(false)
      setBlocked(null)
    } finally {
      setBusy(false)
    }
  }

  if (!fixtureId) return null

  return (
    <>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-busy={busy}
        disabled={busy}
        aria-label={on ? 'Desactivar avisos de este partido' : 'Avisarme de este partido'}
        className={'motm-alert-toggle' + (on ? ' is-on' : '')}
        onClick={() => (on ? void disable() : void enable())}
      >
        <AnimatedBell active={on} size={17} />
        <span className="motm-alert-toggle__track" aria-hidden="true">
          <span className="motm-alert-toggle__thumb" />
        </span>
      </button>

      {blocked && EXPLAINER[blocked] && (
        <p className="motm-note" role="note">
          {EXPLAINER[blocked]}
        </p>
      )}
    </>
  )
}
