import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import AnimatedBell from './AnimatedBell'
import { PANEL_ENTER } from '../lib/motion'
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
 * Activar pregunta antes: es una suscripción que el usuario no ve en ningún
 * listado, así que conviene que quede claro a qué está diciendo que sí y que
 * es solo para este partido. Desactivar no pregunta — deshacer algo debe ser
 * más barato que hacerlo.
 */
export default function MatchAlertToggle({ fixtureId }: { fixtureId: string | undefined }) {
  const { session, profile } = useAuth()
  const reduceMotion = useReducedMotion()
  const [on, setOn] = useState(false)
  const [busy, setBusy] = useState(false)
  const [asking, setAsking] = useState(false)
  const [blocked, setBlocked] = useState<PushStatus | null>(null)

  useEffect(() => {
    if (!fixtureId) return
    let alive = true
    const settle = (value: boolean) => {
      if (!alive) return
      setOn(value)
      setBlocked(null) // al cambiar de partido, fuera el aviso del anterior
      setAsking(false)
    }
    isSubscribedToMatch(fixtureId)
      .then(settle)
      .catch(() => settle(false))
    return () => {
      alive = false
    }
  }, [fixtureId])

  async function confirmEnable() {
    if (!fixtureId || busy) return
    setBusy(true)
    setAsking(false)
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
        onClick={() => (on ? void disable() : setAsking((v) => !v))}
      >
        <AnimatedBell active={on} size={17} />
        <span className="motm-alert-toggle__track" aria-hidden="true">
          <span className="motm-alert-toggle__thumb" />
        </span>
      </button>

      <AnimatePresence>
        {asking && (
          <motion.div
            className="motm-alert-ask"
            role="dialog"
            aria-label="Confirmar avisos del partido"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={reduceMotion ? { duration: 0.001 } : PANEL_ENTER}
          >
            <p className="motm-alert-ask__text">¿Activar las notificaciones solo para este partido?</p>
            <div className="motm-alert-ask__row">
              <button type="button" className="motm-alert-ask__no" onClick={() => setAsking(false)}>
                Ahora no
              </button>
              <button type="button" className="motm-alert-ask__yes" onClick={() => void confirmEnable()}>
                Sí, avisarme
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {blocked && EXPLAINER[blocked] && (
        <p className="motm-note" role="note">
          {EXPLAINER[blocked]}
        </p>
      )}
    </>
  )
}
