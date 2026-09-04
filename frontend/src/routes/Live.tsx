import { useEffect, useState } from 'react'
import { ChartBar, ChartLineUp, UsersThree } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import AnimatedBell from '../components/AnimatedBell'
import AppHeader from '../components/AppHeader'
import ScoreboardCard from '../components/ScoreboardCard'
import MatchTimeline from '../components/MatchTimeline'
import type { GoalChip, LiveMatch, TimelineEvent } from '../types/view'
import {
  hasSupabaseEnv,
  isLiveStatus,
  useGoalChips,
  useLiveMatch,
  useLiveRealtime,
  useTimeline,
} from '../lib/queries'
import { useAuth } from '../lib/AuthProvider'
import { isSubscribedToMatch, subscribeToMatch, unsubscribeFromMatch } from '../lib/matchAlerts'
import type { PushStatus } from '../lib/push'

// Dev-only fallback: used exclusively when running `vite` with no Supabase URL.
const USE_MOCK = import.meta.env.DEV && !import.meta.env.VITE_SUPABASE_URL

const MOCK_MATCH: LiveMatch = {
  id: 'demo',
  competitionShort: 'LaLiga',
  status: 'LIVE',
  minuteLabel: "74'",
  halfStartedAt: new Date(Date.now() - 74 * 60_000).toISOString(),
  halfNumber: 2,
  kickoffAt: new Date().toISOString(),
  home: { id: 'real-madrid', tla: 'RMA', name: 'Real Madrid CF', shortName: 'Real Madrid' },
  away: { id: 'barcelona', tla: 'BAR', name: 'FC Barcelona', shortName: 'Barcelona' },
  homeScore: 2,
  awayScore: 1,
  highlightUrl: null,
  highlightThumbnail: null,
}

const MOCK_GOALS: GoalChip[] = [
  { minuteLabel: "12'", player: 'Vinícius' },
  { minuteLabel: "45+2'", player: 'Lewandowski' },
  { minuteLabel: "63'", player: 'Bellingham' },
]

const MOCK_EVENTS: TimelineEvent[] = [
  { id: '1', type: 'CORNER', minuteLabel: "74'", text: 'Córner a favor del Real Madrid', narration: null },
  { id: '2', type: 'KEY_PASS', minuteLabel: "72'", text: 'Pase filtrado de Bellingham para Vinícius Jr.', narration: null },
  { id: '3', type: 'YELLOW', minuteLabel: "68'", text: 'Tarjeta amarilla a Araújo — falta táctica', narration: null },
  { id: '4', type: 'GOAL', minuteLabel: "63'", text: 'GOL del Real Madrid — Bellingham (asist. Vinícius)', narration: null },
  { id: '5', type: 'SUB', minuteLabel: "60'", text: 'Cambio en el Barça — entra Fermín, sale Gavi', narration: null },
  { id: '6', type: 'PENALTY_GOAL', minuteLabel: "45+2'", text: 'GOL del Barça — Lewandowski (de penalti)', narration: null },
  { id: '7', type: 'YELLOW', minuteLabel: "34'", text: 'Tarjeta amarilla a Gavi', narration: null },
  { id: '8', type: 'GOAL', minuteLabel: "12'", text: 'GOL del Real Madrid — Vinícius Jr.', narration: null },
]

function formatKickoff(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('es-ES', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function ScoreboardSkeleton() {
  return <div className="motm-skel" aria-hidden="true" />
}

function EmptyState({ note, hasFavorite }: { note?: string; hasFavorite: boolean }) {
  return (
    <div className="motm-empty" role="status">
      <b>Sin partido</b>
      {hasFavorite ? 'Tu equipo no juega ahora.' : 'No hay partido de LaLiga ahora.'}
      {note ? (
        <>
          <br />
          {note}
        </>
      ) : null}
    </div>
  )
}

function PrematchNote({ match, hasFavorite }: { match: LiveMatch; hasFavorite: boolean }) {
  const subject = hasFavorite ? 'Tu equipo no juega ahora' : 'Ningún equipo juega ahora'
  const text =
    match.status === 'FINISHED'
      ? `${subject} — último: ${match.home.tla} ${match.homeScore}–${match.awayScore} ${match.away.tla}`
      : `${subject} — próximo: ${match.home.tla}–${match.away.tla} · ${formatKickoff(match.kickoffAt)}`
  return (
    <p className="motm-note" role="note">
      {text}
    </p>
  )
}

/** Por qué no se pueden activar los avisos, en cristiano. `disabled` no está:
 *  ese caso lo resuelve el propio botón pidiendo permiso. */
const ALERT_EXPLAINER: Partial<Record<PushStatus, string>> = {
  'needs-install':
    'Para que te avisemos de los goles de este partido, añade ManOfTheMatch a la pantalla de inicio (Compartir → Añadir a pantalla de inicio) y ábrela desde ahí.',
  denied:
    'Tienes las notificaciones bloqueadas. Actívalas en los ajustes del navegador para recibir los avisos de este partido.',
  unsupported: 'Este dispositivo no admite notificaciones push.',
  'no-vapid': 'Las notificaciones aún no están configuradas en este entorno.',
}

export default function Live() {
  const { session, profile } = useAuth()
  const favoriteTeamId = USE_MOCK ? null : profile?.favorite_team_id ?? null

  const liveQuery = useLiveMatch({ enabled: !USE_MOCK, favoriteTeamId })
  const match: LiveMatch | null | undefined = USE_MOCK ? MOCK_MATCH : liveQuery.data
  const fixtureId = USE_MOCK ? undefined : match?.id
  const live = isLiveStatus(match?.status)

  const goalsQuery = useGoalChips(fixtureId, { enabled: !USE_MOCK, live })
  const timelineQuery = useTimeline(fixtureId, { enabled: !USE_MOCK, live })
  useLiveRealtime(fixtureId, !USE_MOCK)

  const goals: GoalChip[] = USE_MOCK ? MOCK_GOALS : goalsQuery.data ?? []
  const events: TimelineEvent[] = USE_MOCK ? MOCK_EVENTS : timelineQuery.data ?? []

  const loading = !USE_MOCK && liveQuery.isLoading
  const showEmpty = !USE_MOCK && !loading && !match

  // Avisos de ESTE partido (0016), aparte del equipo favorito.
  const [alertOn, setAlertOn] = useState(false)
  const [alertBusy, setAlertBusy] = useState(false)
  const [alertBlocked, setAlertBlocked] = useState<PushStatus | null>(null)

  useEffect(() => {
    if (!fixtureId) return
    let alive = true
    const settle = (on: boolean) => {
      if (!alive) return
      setAlertOn(on)
      setAlertBlocked(null) // al cambiar de partido, fuera el aviso del anterior
    }
    isSubscribedToMatch(fixtureId)
      .then(settle)
      .catch(() => settle(false))
    return () => {
      alive = false
    }
  }, [fixtureId])

  async function toggleMatchAlerts() {
    if (!fixtureId || alertBusy) return
    setAlertBusy(true)
    try {
      if (alertOn) {
        await unsubscribeFromMatch(fixtureId)
        setAlertOn(false)
        setAlertBlocked(null)
      } else {
        const status = await subscribeToMatch(
          fixtureId,
          session?.user.id ?? null,
          favoriteTeamId,
          profile?.prefs ?? { matchday: true, kickoff: true, lineup: true, goals: true },
        )
        setAlertOn(status === 'enabled')
        setAlertBlocked(status === 'enabled' ? null : status)
      }
    } catch {
      setAlertOn(await isSubscribedToMatch(fixtureId).catch(() => false))
    } finally {
      setAlertBusy(false)
    }
  }

  return (
    <>
      <AppHeader />

      {loading && <ScoreboardSkeleton />}

      {showEmpty && (
        <EmptyState
          hasFavorite={!!favoriteTeamId}
          note={hasSupabaseEnv ? undefined : 'Configura Supabase (.env.local) para ver datos en vivo.'}
        />
      )}

      {match && (
        <>
          {!live && <PrematchNote match={match} hasFavorite={!!favoriteTeamId} />}

          <ScoreboardCard match={match} goals={goals} />

          <div className="motm-actions">
            {/* Antes del pitido inicial no hay estadísticas que mostrar —
                el hueco natural es la previsión pre-partido. */}
            {match.status === 'SCHEDULED' ? (
              <Link className="motm-btn" style={{ flex: 1 }} to={`/partidos/${match.id}/previsiones`}>
                <ChartLineUp size={16} />
                Ver previsiones
              </Link>
            ) : (
              <Link className="motm-btn" style={{ flex: 1 }} to={`/partidos/${match.id}/estadisticas`}>
                <ChartBar size={16} />
                Ver estadísticas
              </Link>
            )}
            <Link className="motm-btn" style={{ flex: 1 }} to={`/partidos/${match.id}/alineaciones`}>
              <UsersThree size={16} />
              Ver alineaciones
            </Link>

            {/* Avisos solo de este partido. Va aquí, en la misma fila que el
                resto de acciones del partido, porque es una acción del partido
                — no un ajuste de perfil. Icono suelto para no robarle ancho a
                los dos botones con texto. */}
            {!USE_MOCK && (
              <button
                type="button"
                className={'motm-btn motm-btn--icon' + (alertOn ? ' is-on' : '')}
                aria-pressed={alertOn}
                aria-busy={alertBusy}
                disabled={alertBusy}
                aria-label={
                  alertOn ? 'Desactivar avisos de este partido' : 'Avisarme de los goles de este partido'
                }
                onClick={() => void toggleMatchAlerts()}
              >
                <AnimatedBell active={alertOn} size={20} />
              </button>
            )}
          </div>

          {alertBlocked && ALERT_EXPLAINER[alertBlocked] && (
            <p className="motm-note" role="note">
              {ALERT_EXPLAINER[alertBlocked]}
            </p>
          )}

          <MatchTimeline events={events} />
        </>
      )}
    </>
  )
}
