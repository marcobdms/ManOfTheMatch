import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChartBar } from '@phosphor-icons/react'
import AppHeader from '../components/AppHeader'
import AnimatedBell from '../components/AnimatedBell'
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
import { disablePush, enablePush, getPushStatus, type PushStatus } from '../lib/push'
import { useAuth } from '../lib/AuthProvider'

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
}

const MOCK_GOALS: GoalChip[] = [
  { minuteLabel: "12'", player: 'Vinícius' },
  { minuteLabel: "45+2'", player: 'Lewandowski' },
  { minuteLabel: "63'", player: 'Bellingham' },
]

const MOCK_EVENTS: TimelineEvent[] = [
  { id: '1', type: 'CORNER', minuteLabel: "74'", text: 'Córner a favor del Real Madrid' },
  { id: '2', type: 'KEY_PASS', minuteLabel: "72'", text: 'Pase filtrado de Bellingham para Vinícius Jr.' },
  { id: '3', type: 'YELLOW', minuteLabel: "68'", text: 'Tarjeta amarilla a Araújo — falta táctica' },
  { id: '4', type: 'GOAL', minuteLabel: "63'", text: 'GOL del Real Madrid — Bellingham (asist. Vinícius)' },
  { id: '5', type: 'SUB', minuteLabel: "60'", text: 'Cambio en el Barça — entra Fermín, sale Gavi' },
  { id: '6', type: 'PENALTY_GOAL', minuteLabel: "45+2'", text: 'GOL del Barça — Lewandowski (de penalti)' },
  { id: '7', type: 'YELLOW', minuteLabel: "34'", text: 'Tarjeta amarilla a Gavi' },
  { id: '8', type: 'GOAL', minuteLabel: "12'", text: 'GOL del Real Madrid — Vinícius Jr.' },
]

const PUSH_EXPLAINER: Partial<Record<PushStatus, string>> = {
  'needs-install':
    'Para recibir avisos de goles, añade ManOfTheMatch a la pantalla de inicio (Compartir → Añadir a pantalla de inicio) y ábrela desde ahí.',
  denied:
    'Has bloqueado las notificaciones. Actívalas en los ajustes del navegador para recibir avisos de goles.',
  unsupported: 'Este dispositivo no admite notificaciones push.',
  'no-vapid': 'Las notificaciones aún no están configuradas en este entorno.',
}

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

export default function Live() {
  const { session, profile } = useAuth()
  const [pushStatus, setPushStatus] = useState<PushStatus | null>(null)
  const [pushBusy, setPushBusy] = useState(false)

  useEffect(() => {
    let alive = true
    getPushStatus()
      .then((status) => {
        if (alive) setPushStatus(status)
      })
      .catch(() => {
        if (alive) setPushStatus('unsupported')
      })
    return () => {
      alive = false
    }
  }, [])

  const pushEnabled = pushStatus === 'enabled'
  const favoriteTeamId = USE_MOCK ? null : profile?.favorite_team_id ?? null

  async function toggleBell() {
    if (pushBusy) return
    setPushBusy(true)
    try {
      setPushStatus(
        pushEnabled
          ? await disablePush()
          : await enablePush(
              session?.user.id ?? null,
              favoriteTeamId,
              profile?.prefs ?? { matchday: true, kickoff: true, lineup: true, goals: true },
            ),
      )
    } catch {
      setPushStatus(await getPushStatus())
    } finally {
      setPushBusy(false)
    }
  }

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
            <Link className="motm-btn" style={{ flex: 1 }} to={`/partidos/${match.id}/estadisticas`}>
              <ChartBar size={16} />
              Ver estadísticas
            </Link>
            <button
              className="motm-btn motm-btn--icon"
              aria-pressed={pushEnabled}
              aria-label={
                pushEnabled
                  ? 'Desactivar notificaciones del partido'
                  : 'Activar notificaciones del partido'
              }
              aria-busy={pushBusy}
              disabled={pushBusy}
              onClick={toggleBell}
            >
              {pushEnabled && <span className="motm-dot" />}
              <AnimatedBell active={pushEnabled} />
            </button>
          </div>

          {pushStatus && PUSH_EXPLAINER[pushStatus] && (
            <p className="motm-note" role="note">
              {PUSH_EXPLAINER[pushStatus]}
            </p>
          )}

          <MatchTimeline events={events} />
        </>
      )}
    </>
  )
}
