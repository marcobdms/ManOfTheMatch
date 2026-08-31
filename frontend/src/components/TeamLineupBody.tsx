import LineupSkeleton from './LineupSkeleton'
import PitchLineup from './PitchLineup'
import PlayerCard from './PlayerCard'
import type { LineupFreshness, TeamLineupSnapshot } from '../types/view'

const FRESHNESS_LABEL: Record<LineupFreshness, string> = {
  confirmed: 'Alineación confirmada',
  predicted: 'Alineación probable',
  last_played: 'Sin alineación reciente',
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })
}

type Props = {
  snapshot: TeamLineupSnapshot | null | undefined
  loading: boolean
  isError: boolean
}

/** Cancha + banquillo de un equipo — extraído de TeamLineup.tsx para
 *  reciclarlo también en la vista de alineaciones por partido (dos equipos,
 *  un selector). */
export default function TeamLineupBody({ snapshot, loading, isError }: Props) {
  const starters = snapshot?.players.filter((p) => p.isStarter) ?? []
  const subs = snapshot?.players.filter((p) => !p.isStarter) ?? []

  return (
    <>
      {snapshot && (
        <div className={`motm-freshness motm-freshness--${snapshot.lineupType}`}>
          {FRESHNESS_LABEL[snapshot.lineupType]}
          {snapshot.lineupType === 'last_played' && snapshot.opponentName && (
            <span className="motm-freshness__detail">
              {' '}
              — último once ante {snapshot.opponentName}
              {snapshot.kickoffAt ? `, ${formatDate(snapshot.kickoffAt)}` : ''}
            </span>
          )}
          {snapshot.lineupType !== 'last_played' && snapshot.opponentName && (
            <span className="motm-freshness__detail">
              {' '}
              — {snapshot.isHome ? 'vs' : 'fuera ante'} {snapshot.opponentName}
              {snapshot.kickoffAt ? `, ${formatDate(snapshot.kickoffAt)}` : ''}
            </span>
          )}
        </div>
      )}

      {loading && <LineupSkeleton />}

      {!loading && isError && (
        <div className="motm-empty">
          <b>No se pudo cargar</b>
          Inténtalo de nuevo en unos minutos.
        </div>
      )}

      {!loading && !isError && !snapshot && (
        <div className="motm-empty">
          <b>Sin alineación todavía</b>
          Todavía no tenemos la alineación de este equipo.
        </div>
      )}

      {!loading && snapshot && starters.length > 0 && <PitchLineup starters={starters} />}

      {!loading && snapshot && subs.length > 0 && (
        <div className="motm-subs">
          <h2 className="motm-label motm-subs__title">Suplentes</h2>
          <div className="motm-subs__row">
            {subs.map((p, i) => (
              <PlayerCard key={`${p.name}-${i}`} player={p} variant="sub" />
            ))}
          </div>
        </div>
      )}
    </>
  )
}
