import { UserCircle } from '@phosphor-icons/react'
import type { LineupPlayer } from '../types/view'

type Props = {
  player: LineupPlayer
  /** Carta de titular (sobre la cancha) vs suplente (fila del banquillo). */
  variant?: 'starter' | 'sub'
}

/** Nota de 0-10 a nivel: tiñe el círculo sin depender solo del color (el
 *  número siempre está escrito). */
function ratingTier(rating: number): string {
  if (rating >= 7.5) return 'high'
  if (rating >= 6.5) return 'mid'
  return 'low'
}

/** Carta de jugador. El dorsal hace de marca de agua en itálica, la foto
 *  recortada flota por encima con sombra propia, y la última nota del partido
 *  va en el círculo de la esquina. Sin foto cae al icono de siempre. */
export default function PlayerCard({ player, variant = 'starter' }: Props) {
  const rating = player.rating ?? player.seasonRating

  if (variant === 'sub') {
    return (
      <div className="motm-pcard motm-pcard--sub">
        {player.number != null && <span className="motm-pcard__number">{player.number}</span>}
        <span className="motm-pcard__avatar" aria-hidden="true">
          {player.photoUrl ? (
            <img src={player.photoUrl} alt="" loading="lazy" />
          ) : (
            <UserCircle size={20} weight="fill" />
          )}
        </span>
        <span className="motm-pcard__name">{player.shortName}</span>
        {player.position && <span className="motm-pcard__pos">{player.position}</span>}
        {rating != null && <span className="motm-pcard__rating">{rating.toFixed(1)}</span>}
      </div>
    )
  }

  return (
    <div className="motm-pcard motm-pcard--starter">
      {player.number != null && <span className="motm-pcard__dorsal" aria-hidden="true">{player.number}</span>}

      <span className="motm-pcard__photo">
        {player.photoUrl ? (
          <img src={player.photoUrl} alt="" loading="lazy" />
        ) : (
          <UserCircle size={30} weight="fill" className="motm-pcard__silhouette" />
        )}
      </span>

      {rating != null && (
        <span className={`motm-pcard__badge motm-pcard__badge--${ratingTier(rating)}`}>
          {rating.toFixed(1)}
        </span>
      )}

      <span className="motm-pcard__foot">
        <span className="motm-pcard__name">{player.shortName}</span>
        {player.position && <span className="motm-pcard__pos">{player.position}</span>}
      </span>
    </div>
  )
}
