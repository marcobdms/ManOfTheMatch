import type { MatchShot, TeamLite } from '../types/view'

const TYPE_LABEL: Record<MatchShot['type'], string> = {
  Goal: 'Gol',
  Miss: 'Fuera',
  AttemptSaved: 'Parado',
  BlockedShot: 'Bloqueado',
  Post: 'Al palo',
}

const SITUATION_LABEL: Record<NonNullable<MatchShot['situation']>, string> = {
  OpenPlay: 'Jugada',
  SetPiece: 'Balón parado',
  FastBreak: 'Contragolpe',
  Corner: 'Córner',
  Penalty: 'Penalti',
  DirectFreekick: 'Falta directa',
}

/** Fila de disparo — minuto, autor, tipo y xG. Un gol se destaca en rojo. */
function ShotRow({ shot, isHome }: { shot: MatchShot; isHome: boolean }) {
  return (
    <li className={'motm-shot' + (shot.type === 'Goal' ? ' motm-shot--goal' : '')}>
      <span className="motm-shot__min">{shot.minute}'</span>
      <span className={'motm-shot__side' + (isHome ? '' : ' motm-shot__side--away')} aria-hidden="true" />
      <div className="motm-shot__body">
        <span className="motm-shot__player">{shot.playerName}</span>
        <span className="motm-shot__meta">
          {TYPE_LABEL[shot.type]}
          {shot.situation ? ` · ${SITUATION_LABEL[shot.situation]}` : ''}
        </span>
      </div>
      <span className="motm-shot__xg">{shot.xg != null ? shot.xg.toFixed(2) : '—'}</span>
    </li>
  )
}

/** Lista cronológica de disparos con xG — tabla `match_shots` (Agente A). */
export default function ShotsList({ shots, home }: { shots: MatchShot[]; home: TeamLite }) {
  return (
    <ul className="motm-shot-list">
      {shots.map((shot) => (
        <ShotRow key={shot.id} shot={shot} isHome={shot.teamId === home.id} />
      ))}
    </ul>
  )
}
