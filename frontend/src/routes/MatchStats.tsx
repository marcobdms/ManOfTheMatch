import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft } from '@phosphor-icons/react'
import AppHeader from '../components/AppHeader'
import TeamCrest from '../components/TeamCrest'
import MomentumChart from '../components/MomentumChart'
import StatCompareRow from '../components/StatCompareRow'
import ShotsList from '../components/ShotsList'
import {
  useLiveMatch,
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

/** Estadísticas del partido — botón "Ver estadísticas" en En vivo. Jerarquía:
 *  momentum (lo más pedido) arriba, comparativa de equipo con pestañas de
 *  periodo, disparos con xG, y ranking de jugadores por rating.
 *
 *  Momentum, comparativa y disparos dependen de tablas que la ingesta del
 *  Agente A todavía puede no haber creado (`match_momentum`,
 *  `match_team_stats`, `match_shots`) — los hooks de lib/queries.ts devuelven
 *  vacío en ese caso (nunca datos inventados) y cada bloque se omite solo. */
export default function MatchStats() {
  const { fixtureId } = useParams<{ fixtureId: string }>()
  const navigate = useNavigate()
  const [period, setPeriod] = useState<StatPeriod>('total')

  // El marcador ya vivía en caché de React Query desde la vista En vivo —
  // reutilizarlo evita una segunda consulta solo para escudos/nombres.
  const liveQuery = useLiveMatch()
  const match = liveQuery.data?.id === fixtureId ? liveQuery.data : undefined
  const isLive = match?.status === 'LIVE'

  const statsQuery = usePlayerStats(fixtureId, { live: isLive })
  const momentumQuery = useMatchMomentum(fixtureId, { live: isLive })
  const teamStatsQuery = useTeamMatchStats(fixtureId, { live: isLive })
  const shotsQuery = useMatchShots(fixtureId, { live: isLive })

  const stats = statsQuery.data ?? []
  const home = match ? stats.filter((p) => p.teamId === match.home.id) : []
  const away = match ? stats.filter((p) => p.teamId === match.away.id) : []

  const momentum = momentumQuery.data ?? []
  const comparison = teamStatsQuery.data
  const periodStats = comparison?.[period] ?? []
  const shots = shotsQuery.data ?? []

  const loading = statsQuery.isLoading || momentumQuery.isLoading || teamStatsQuery.isLoading
  const hasAnything = stats.length > 0 || momentum.length > 0 || periodStats.length > 0 || shots.length > 0

  return (
    <>
      <AppHeader />
      <div className="motm-lineup">
        <div className="motm-lineup__head">
          <button type="button" className="motm-iconbtn motm-lineup__back" aria-label="Volver" onClick={() => navigate(-1)}>
            <ArrowLeft size={22} />
          </button>
          <div className="motm-lineup__identity">
            <h1 className="motm-lineup__name">Estadísticas</h1>
            {match && (
              <p className="motm-lineup__meta">
                {match.home.shortName} {match.homeScore}–{match.awayScore} {match.away.shortName}
              </p>
            )}
          </div>
        </div>

        {loading && (
          <div className="motm-skel" style={{ height: 260, margin: '16px' }} aria-hidden="true" />
        )}

        {!loading && !hasAnything && (
          <div className="motm-empty">
            <b>Sin estadísticas todavía</b>
            Las estadísticas del partido se publican al terminar. Vuelve más tarde.
          </div>
        )}

        {!loading && hasAnything && match && (
          <>
            {momentum.length > 0 && (
              <MomentumChart points={momentum} home={match.home} away={match.away} />
            )}

            {(comparison?.total.length ?? 0) > 0 && (
              <div className="motm-compare">
                <div className="motm-compare__head">
                  <TeamCrest teamId={match.home.id} tla={match.home.tla} size={28} />
                  <span className="motm-label">Comparativa</span>
                  <TeamCrest teamId={match.away.id} tla={match.away.tla} size={28} />
                </div>

                <div className="motm-segmented" role="group" aria-label="Periodo del partido">
                  {(Object.keys(PERIOD_LABEL) as StatPeriod[]).map((p) => (
                    <button
                      key={p}
                      type="button"
                      className="motm-segmented__btn"
                      aria-pressed={period === p}
                      disabled={(comparison?.[p]?.length ?? 0) === 0}
                      onClick={() => setPeriod(p)}
                    >
                      {PERIOD_LABEL[p]}
                    </button>
                  ))}
                </div>

                <div className="motm-compare__rows">
                  {periodStats.map((pair) => (
                    <StatCompareRow key={pair.key} pair={pair} />
                  ))}
                </div>
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
