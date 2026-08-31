import { useState } from 'react'
import { UserCircle } from '@phosphor-icons/react'
import { motion, useReducedMotion } from 'framer-motion'
import { fullPositionLabel } from '../lib/positions'
import type { LineupPlayer } from '../types/view'

type Props = {
  player: LineupPlayer
  /** Carta de titular (sobre la cancha, con reverso) vs suplente (fila del banquillo). */
  variant?: 'starter' | 'sub'
}

/** Nota de 0-10 a nivel: tiñe el círculo sin depender solo del color (el
 *  número siempre está escrito). */
function ratingTier(rating: number): string {
  if (rating >= 7.5) return 'high'
  if (rating >= 6.5) return 'mid'
  return 'low'
}

/** Carta de jugador. El dorsal hace de marca de agua en itálica dentro del
 *  cuerpo de esquinas redondeadas; la foto recortada y el círculo de nota
 *  viven FUERA de ese cuerpo (mismo padre, sin su `overflow: hidden`) para
 *  poder salirse del marco sin arrastrar al dorsal con ellos. Sin foto cae al
 *  icono de siempre. Click/tap gira la carta 180° y muestra el reverso con
 *  datos de ficha — estáticos, no hace falta refrescarlos con el partido. */
export default function PlayerCard({ player, variant = 'starter' }: Props) {
  const rating = player.rating ?? player.seasonRating
  const [flipped, setFlipped] = useState(false)
  const reduceMotion = useReducedMotion()

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

  const positionFull = fullPositionLabel(player.position)
  const lastRating = player.rating
  const seasonRating = player.seasonRating

  return (
    <button
      type="button"
      className="motm-pcard-wrap"
      aria-pressed={flipped}
      aria-label={`${player.name} — toca para ver su ficha`}
      onClick={() => setFlipped((f) => !f)}
    >
      <motion.div
        className="motm-pcard-inner"
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ duration: reduceMotion ? 0.001 : 0.5, ease: [0.4, 0, 0.2, 1] }}
      >
        <div className="motm-pcard-face motm-pcard-face--front">
          <div className="motm-pcard motm-pcard--starter">
            {player.number != null && (
              <span className="motm-pcard__dorsal" aria-hidden="true">
                {player.number}
              </span>
            )}
            <span className="motm-pcard__foot">
              <span className="motm-pcard__name">{player.shortName}</span>
              {player.position && <span className="motm-pcard__pos">{player.position}</span>}
            </span>
          </div>

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
        </div>

        <div className="motm-pcard-face motm-pcard-face--back">
          <div className="motm-pcard motm-pcard--back">
            <span className="motm-pcard-back__name">{player.shortName}</span>
            <span className="motm-pcard-back__row">
              <span className="motm-pcard-back__label">Edad</span>
              <span>{player.age != null ? `${player.age} años` : '—'}</span>
            </span>
            <span className="motm-pcard-back__row">
              <span className="motm-pcard-back__label">País</span>
              <span>{player.country ?? '—'}</span>
            </span>
            <span className="motm-pcard-back__row">
              <span className="motm-pcard-back__label">Posición</span>
              <span>{positionFull ?? '—'}</span>
            </span>
            {seasonRating != null && (
              <span className="motm-pcard-back__row">
                <span className="motm-pcard-back__label">Media temp.</span>
                <span>{seasonRating.toFixed(2)}</span>
              </span>
            )}
            {lastRating != null && (
              <span className="motm-pcard-back__row">
                <span className="motm-pcard-back__label">Último partido</span>
                <span>{lastRating.toFixed(2)}</span>
              </span>
            )}
          </div>
        </div>
      </motion.div>
    </button>
  )
}
