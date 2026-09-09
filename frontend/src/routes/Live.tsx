import { Link } from 'react-router-dom'
import AppHeader from '../components/AppHeader'
import LiveMatchView from '../components/LiveMatchView'
import ScoreboardCard from '../components/ScoreboardCard'
import type { GoalChip, LiveMatch } from '../types/view'
import { hasSupabaseEnv, isLiveStatus, useGoalChips, useLiveMatches } from '../lib/queries'
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
  highlightUrl: null,
  highlightKind: null,
  highlightThumbnail: null,
}

const MOCK_GOALS: GoalChip[] = [
  { minuteLabel: "12'", player: 'Vinícius' },
  { minuteLabel: "45+2'", player: 'Lewandowski' },
  { minuteLabel: "63'", player: 'Bellingham' },
]

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

/** Una tarjeta de la lista cuando hay varios en directo. Mismo tamaño que la
 *  del directo (incluye los goles), y toda ella es un enlace a su propio
 *  directo `/en-vivo/:id`. */
function LiveMatchCard({ match }: { match: LiveMatch }) {
  const goalsQuery = useGoalChips(match.id, { live: isLiveStatus(match.status) })
  return (
    <Link to={`/en-vivo/${match.id}`} className="motm-live-card">
      <ScoreboardCard match={match} goals={goalsQuery.data ?? []} linkTeams={false} />
    </Link>
  )
}

export default function Live() {
  const { profile } = useAuth()
  const favoriteTeamId = USE_MOCK ? null : profile?.favorite_team_id ?? null

  const query = useLiveMatches({ enabled: !USE_MOCK, favoriteTeamId })
  const matches: LiveMatch[] = USE_MOCK ? [MOCK_MATCH] : query.data ?? []
  const liveCount = matches.filter((m) => isLiveStatus(m.status)).length

  const loading = !USE_MOCK && query.isLoading
  const showEmpty = !USE_MOCK && !loading && matches.length === 0

  const headLabel =
    liveCount > 0
      ? `${liveCount} ${liveCount === 1 ? 'partido en directo' : 'partidos en directo'}`
      : `${matches.length} ${matches.length === 1 ? 'partido hoy' : 'partidos hoy'}`

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

      {USE_MOCK && <LiveMatchViewMock />}

      {/* Varios partidos (hoy o en directo): lista de tarjetas del tamaño de
          la del directo; cada una lleva a su propio directo con timeline. */}
      {!USE_MOCK && matches.length > 1 && (
        <div className="motm-live-list">
          <p className="motm-live-list__head">{headLabel}</p>
          {matches.map((m) => (
            <LiveMatchCard key={m.id} match={m} />
          ))}
        </div>
      )}

      {/* Uno solo: la vista clásica con marcador + acciones + timeline. */}
      {!USE_MOCK && matches.length === 1 && <LiveMatchView match={matches[0]} />}
    </>
  )
}

/** El mock de desarrollo no pasa por react-query. */
function LiveMatchViewMock() {
  return <ScoreboardCard match={MOCK_MATCH} goals={MOCK_GOALS} />
}
