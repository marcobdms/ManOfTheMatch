import { ChartBar, ChartLineUp, UsersThree } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import ScoreboardCard from './ScoreboardCard'
import MatchTimeline from './MatchTimeline'
import { isLiveStatus, useGoalChips, useLiveRealtime, useTimeline } from '../lib/queries'
import type { LiveMatch } from '../types/view'

/**
 * El directo de UN partido: marcador + acciones + timeline. Lo usan tanto la
 * pestaña "En vivo" (cuando hay un solo partido) como la ruta por partido
 * `/en-vivo/:fixtureId` (cuando el usuario abre uno de varios).
 */
export default function LiveMatchView({ match }: { match: LiveMatch }) {
  const live = isLiveStatus(match.status)
  const goalsQuery = useGoalChips(match.id, { live })
  const timelineQuery = useTimeline(match.id, { live })
  useLiveRealtime(match.id, true)

  return (
    <>
      <ScoreboardCard match={match} goals={goalsQuery.data ?? []} />

      <div className="motm-actions">
        {/* Antes del pitido inicial no hay estadísticas — el hueco lo ocupa
            la previsión pre-partido. */}
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
      </div>

      <MatchTimeline events={timelineQuery.data ?? []} />
    </>
  )
}
