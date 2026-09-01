import { ChartBar, YoutubeLogo } from '@phosphor-icons/react'
import { Link, useParams } from 'react-router-dom'
import AppHeader from '../components/AppHeader'
import BackButton from '../components/BackButton'
import ScoreboardCard from '../components/ScoreboardCard'
import MatchTimeline from '../components/MatchTimeline'
import { useFixtureById, useGoalChips, useTimeline } from '../lib/queries'

/** Detalle de un partido ya jugado — recicla ScoreboardCard/MatchTimeline de
 *  En vivo, sin polling ni campana (no aplica a un partido FINISHED). */
export default function MatchDetail() {
  const { fixtureId } = useParams<{ fixtureId: string }>()
  const matchQuery = useFixtureById(fixtureId)
  const goalsQuery = useGoalChips(fixtureId)
  const timelineQuery = useTimeline(fixtureId)

  const match = matchQuery.data

  return (
    <>
      <AppHeader />
      <div className="motm-lineup">
        <div className="motm-lineup__head">
          <BackButton />
          <h1 className="motm-lineup__name">Partido</h1>
        </div>

        {matchQuery.isLoading && <div className="motm-skel" style={{ margin: '16px' }} aria-hidden="true" />}

        {!matchQuery.isLoading && !match && (
          <div className="motm-empty">
            <b>Partido no encontrado</b>
          </div>
        )}

        {match && (
          <>
            <ScoreboardCard match={match} goals={goalsQuery.data ?? []} />
            <div className="motm-actions">
              <Link className="motm-btn" style={{ flex: 1 }} to={`/partidos/${match.id}/estadisticas`}>
                <ChartBar size={16} />
                Ver estadísticas
              </Link>
              {/* En cualquier partido terminado, aunque todavía no haya vídeo:
                  la vista explica que aún no se ha subido. Antes se ocultaba y
                  no había forma de enterarse. */}
              {match.status === 'FINISHED' && (
                <Link className="motm-btn" style={{ flex: 1 }} to={`/partidos/${match.id}/highlights`}>
                  <YoutubeLogo size={18} weight="fill" />
                  Ver highlights
                </Link>
              )}
            </div>
            <MatchTimeline events={timelineQuery.data ?? []} />
          </>
        )}
      </div>
    </>
  )
}
