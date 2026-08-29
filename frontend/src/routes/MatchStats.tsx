import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft } from '@phosphor-icons/react'
import AppHeader from '../components/AppHeader'
import TeamCrest from '../components/TeamCrest'
import { useLiveMatch, usePlayerStats } from '../lib/queries'
import type { PlayerStat } from '../types/view'

/** Fila de una tabla de stats por equipo (posesión-like: barra comparativa). */
function CompareRow({ label, home, away }: { label: string; home: number; away: number }) {
  const total = home + away || 1
  return (
    <div className="motm-compare-row">
      <span className="motm-compare-row__val">{home}</span>
      <div className="motm-compare-row__mid">
        <span className="motm-compare-row__label">{label}</span>
        <div className="motm-compare-row__bar">
          <span className="motm-compare-row__bar-fill" style={{ width: `${(home / total) * 100}%` }} />
        </div>
      </div>
      <span className="motm-compare-row__val">{away}</span>
    </div>
  )
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

/** Estadísticas del partido — botón "Ver estadísticas" en En vivo. Datos
 *  reales de `player_match_stats` (solo existen post-partido); sin datos aún
 *  se muestra un estado vacío explícito, nunca números inventados. */
export default function MatchStats() {
  const { fixtureId } = useParams<{ fixtureId: string }>()
  const navigate = useNavigate()

  // El marcador ya vivía en caché de React Query desde la vista En vivo —
  // reutilizarlo evita una segunda consulta solo para escudos/nombres.
  const liveQuery = useLiveMatch()
  const match = liveQuery.data?.id === fixtureId ? liveQuery.data : undefined
  const statsQuery = usePlayerStats(fixtureId, { live: match?.status === 'LIVE' })

  const stats = statsQuery.data ?? []
  const home = match ? stats.filter((p) => p.teamId === match.home.id) : []
  const away = match ? stats.filter((p) => p.teamId === match.away.id) : []
  const loading = statsQuery.isLoading
  const hasStats = stats.length > 0

  const sum = (rows: PlayerStat[], key: 'shots' | 'shotsOn' | 'passes' | 'tackles') =>
    rows.reduce((acc, r) => acc + r[key], 0)

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

        {!loading && !hasStats && (
          <div className="motm-empty">
            <b>Sin estadísticas todavía</b>
            Las estadísticas del partido se publican al terminar. Vuelve más tarde.
          </div>
        )}

        {!loading && hasStats && match && (
          <>
            <div className="motm-compare">
              <div className="motm-compare__head">
                <TeamCrest teamId={match.home.id} tla={match.home.tla} size={28} />
                <span className="motm-label">Comparativa</span>
                <TeamCrest teamId={match.away.id} tla={match.away.tla} size={28} />
              </div>
              <CompareRow label="Tiros" home={sum(home, 'shots')} away={sum(away, 'shots')} />
              <CompareRow label="Tiros a puerta" home={sum(home, 'shotsOn')} away={sum(away, 'shotsOn')} />
              <CompareRow label="Pases" home={sum(home, 'passes')} away={sum(away, 'passes')} />
              <CompareRow label="Entradas" home={sum(home, 'tackles')} away={sum(away, 'tackles')} />
            </div>

            <div className="motm-stat-team">
              <h2 className="motm-label motm-subs__title">{match.home.shortName}</h2>
              <ul className="motm-stat-player-list">
                {home.map((p) => (
                  <PlayerRow key={p.playerName} p={p} />
                ))}
              </ul>
            </div>

            <div className="motm-stat-team">
              <h2 className="motm-label motm-subs__title">{match.away.shortName}</h2>
              <ul className="motm-stat-player-list">
                {away.map((p) => (
                  <PlayerRow key={p.playerName} p={p} />
                ))}
              </ul>
            </div>
          </>
        )}
      </div>
    </>
  )
}
