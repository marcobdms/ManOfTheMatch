import { useState } from 'react'
import { useParams } from 'react-router-dom'
import AppHeader from '../components/AppHeader'
import { Segmented, SegmentedButton } from '../components/Segmented'
import BackButton from '../components/BackButton'
import TeamCrest from '../components/TeamCrest'
import MomentumChart from '../components/MomentumChart'
import StatCarousel from '../components/StatCarousel'
import StatHighlights from '../components/StatHighlights'
import ShotsList from '../components/ShotsList'
import {
  useFixtureById,
  useMatchMomentum,
  useMatchShots,
  usePlayerStats,
  useTeamMatchStats,
} from '../lib/queries'
import type { PlayerStat, StatPeriod } from '../types/view'

const PERIOD_LABEL: Record<StatPeriod, string> = {
  total: 'Total',
  first: '1ª parte',
  second: '2ª parte',
}

function PlayerRow({ p }: { p: PlayerStat }) {
  return (
    <li className="motm-stat-player">
      <span className="motm-stat-player__name">{p.playerName}</span>
      <span className="motm-stat-player__mins">{p.minutes != null ? `${p.minutes}'` : '—'}</span>
      <span className="motm-stat-player__rating">{p.rating != null ? p.rating.toFixed(1) : '—'}</span>
    </li>
  )
}

/** Estadísticas del partido. Orden: lo destacado (posesión, xG, tiros a
 *  puerta), el momentum, la comparativa completa por bloques con selector de
 *  periodo, los disparos y las notas de los jugadores.
 *
 *  El partido se pide por id (`useFixtureById`) y no del partido en vivo:
 *  esta vista se abre también desde "Pasados" y desde el histórico, donde el
 *  partido en vivo es otro o no hay ninguno — antes salía en blanco entera. */
export default function MatchStats() {
  const { fixtureId } = useParams<{ fixtureId: string }>()
  const [period, setPeriod] = useState<StatPeriod>('total')

  const matchQuery = useFixtureById(fixtureId)
  const match = matchQuery.data
  const isLive = match?.status === 'LIVE' || match?.status === 'PAUSED'

  const statsQuery = usePlayerStats(fixtureId, { live: isLive })
  const momentumQuery = useMatchMomentum(fixtureId, { live: isLive })
  const teamStatsQuery = useTeamMatchStats(fixtureId, { live: isLive })
  const shotsQuery = useMatchShots(fixtureId, { live: isLive })

  const stats = statsQuery.data ?? []
  const home = match ? stats.filter((p) => p.teamId === match.home.id) : []
  const away = match ? stats.filter((p) => p.teamId === match.away.id) : []

  const momentum = momentumQuery.data ?? []
  const comparison = teamStatsQuery.data
  const periodGroups = comparison?.[period] ?? []
  const totalGroups = comparison?.total ?? []
  const shots = shotsQuery.data ?? []

  const loading =
    matchQuery.isLoading || statsQuery.isLoading || momentumQuery.isLoading || teamStatsQuery.isLoading
  const hasAnything =
    stats.length > 0 || momentum.length > 0 || totalGroups.length > 0 || shots.length > 0

  return (
    <>
      <AppHeader />
      <div className="motm-lineup">
        <div className="motm-lineup__head">
          <BackButton />
          <div className="motm-lineup__identity">
            <h1 className="motm-lineup__name">Estadísticas</h1>
            {match && (
              <p className="motm-lineup__meta">
                {match.home.shortName} {match.homeScore}–{match.awayScore} {match.away.shortName}
              </p>
            )}
          </div>
        </div>

        {loading && <div className="motm-skel" style={{ height: 260, margin: '16px' }} aria-hidden="true" />}

        {!loading && !hasAnything && (
          <div className="motm-empty">
            <b>Sin estadísticas todavía</b>
            Las estadísticas del partido se publican al terminar. Vuelve más tarde.
          </div>
        )}

        {!loading && hasAnything && match && (
          <>
            {totalGroups.length > 0 && (
              <StatHighlights groups={totalGroups} home={match.home} away={match.away} />
            )}

            {momentum.length > 0 && (
              <MomentumChart points={momentum} home={match.home} away={match.away} />
            )}

            {totalGroups.length > 0 && (
              <div className="motm-compare">
                <div className="motm-compare__head">
                  <TeamCrest teamId={match.home.id} tla={match.home.tla} size={28} />
                  <span className="motm-label">Comparativa</span>
                  <TeamCrest teamId={match.away.id} tla={match.away.tla} size={28} />
                </div>

                <Segmented id="period" ariaLabel="Periodo del partido">
                  {(Object.keys(PERIOD_LABEL) as StatPeriod[]).map((p) => (
                    <SegmentedButton
                      key={p}
                      active={period === p}
                      disabled={(comparison?.[p]?.length ?? 0) === 0}
                      onClick={() => setPeriod(p)}
                    >
                      {PERIOD_LABEL[p]}
                    </SegmentedButton>
                  ))}
                </Segmented>

                {/* `key` con el periodo: al cambiar de parte el carrusel se
                    remonta y vuelve a la primera tarjeta, en vez de quedarse
                    a medias mostrando un bloque que quizá ya no existe. */}
                <StatCarousel key={period} groups={periodGroups} />
              </div>
            )}

            {shots.length > 0 && (
              <div className="motm-stat-team">
                <h2 className="motm-label motm-subs__title">Disparos</h2>
                <ShotsList shots={shots} home={match.home} />
              </div>
            )}

            {home.length > 0 && (
              <div className="motm-stat-team">
                <h2 className="motm-label motm-subs__title">{match.home.shortName}</h2>
                <ul className="motm-stat-player-list">
                  {home.map((p) => (
                    <PlayerRow key={p.playerName} p={p} />
                  ))}
                </ul>
              </div>
            )}

            {away.length > 0 && (
              <div className="motm-stat-team">
                <h2 className="motm-label motm-subs__title">{match.away.shortName}</h2>
                <ul className="motm-stat-player-list">
                  {away.map((p) => (
                    <PlayerRow key={p.playerName} p={p} />
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
