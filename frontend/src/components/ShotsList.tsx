import type { MatchShot, TeamLite } from '../types/view'

const TYPE_LABEL: Record<MatchShot['type'], string> = {
  Goal: 'Gol',
  Miss: 'Fuera',
  AttemptSaved: 'Parado',
  Post: 'Al palo',
}

const SITUATION_LABEL: Record<string, string> = {
  RegularPlay: 'Jugada',
  FromCorner: 'Córner',
  SetPiece: 'Balón parado',
  FreeKick: 'Falta',
  FastBreak: 'Contragolpe',
  ThrowInSetPiece: 'Saque de banda',
}

/** Fotmob manda la situación como texto libre y aparecen valores nuevos sin
 *  avisar (así salió un "undefined" en pantalla). Lo que no se reconoce se
 *  omite en vez de pintarse: mejor decir menos que decir una palabra rota. */
function situationLabel(situation: string | null): string | null {
  if (!situation) return null
  return SITUATION_LABEL[situation] ?? null
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
          {TYPE_LABEL[shot.type] ?? 'Disparo'}
          {situationLabel(shot.situation) ? ` · ${situationLabel(shot.situation)}` : ''}
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
