import { UserCircle } from '@phosphor-icons/react'
import type { LineupPlayer } from '../types/view'

type Props = {
  player: LineupPlayer
  /** Tarjeta de titular (dorada) vs suplente (plana). */
  variant?: 'starter' | 'sub'
}

/** Carta de jugador — dorada para titulares, plana para el banquillo.
 *  Sin foto todavía: placeholder de icono (plan §A4, pasada de diseño futura
 *  para el acabado tipo FIFA con foto/foil/rareza). */
export default function PlayerCard({ player, variant = 'starter' }: Props) {
  const rating = player.rating ?? player.seasonRating

  return (
    <div className={`motm-pcard motm-pcard--${variant}`}>
      {player.number != null && <span className="motm-pcard__number">{player.number}</span>}
      <span className="motm-pcard__avatar" aria-hidden="true">
        <UserCircle size={variant === 'starter' ? 26 : 20} weight="fill" />
      </span>
      <span className="motm-pcard__name">{player.shortName}</span>
      {player.position && <span className="motm-pcard__pos">{player.position}</span>}
      {rating != null && <span className="motm-pcard__rating">{rating.toFixed(1)}</span>}
    </div>
  )
}
