import { useState } from 'react'
import { UserCircle } from '@phosphor-icons/react'
import { motion, useReducedMotion } from 'framer-motion'
import { EASE_OUT } from '../lib/motion'
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

/** Carta de jugador. La foto vive DENTRO del cuerpo recortado (nunca se sale
 *  del marco, venga como venga de encuadrada la fuente) en una ventana fija
 *  con `object-fit: cover` anclado arriba — eso además empareja el encuadre
 *  entre fotos que llegan con planos distintos (primer plano vs. medio
 *  cuerpo), aunque no sea perfecto. El dorsal queda por debajo, visible en el
 *  margen que la foto no cubre. Sin foto cae al icono de siempre. Click/tap
 *  gira la carta 180° y muestra el reverso con datos de ficha — estáticos,
 *  no hace falta refrescarlos con el partido. */
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
            <img src={player.photoUrl} alt="" loading="lazy" decoding="async" />
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

  const seasonRating = player.seasonRating

  return (
    <button
      type="button"
      className={'motm-pcard-wrap' + (flipped ? ' is-flipped' : '')}
      aria-pressed={flipped}
      aria-label={`${player.name} — toca para ver su ficha`}
      onClick={() => setFlipped((f) => !f)}
    >
      <motion.div
        className="motm-pcard-inner"
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ duration: reduceMotion ? 0.001 : 0.5, ease: EASE_OUT }}
      >
        <div className="motm-pcard-face motm-pcard-face--front">
          <div className="motm-pcard motm-pcard--starter">
            {player.number != null && (
              <span className="motm-pcard__dorsal" aria-hidden="true">
                {player.number}
              </span>
            )}

            <span className="motm-pcard__photo">
              {player.photoUrl ? (
                <img src={player.photoUrl} alt="" loading="lazy" decoding="async" />
              ) : (
                <UserCircle size={30} weight="fill" className="motm-pcard__silhouette" />
              )}
            </span>

            <span className="motm-pcard__foot">
              <span className="motm-pcard__name">{player.shortName}</span>
              {player.position && <span className="motm-pcard__pos">{player.position}</span>}
            </span>
          </div>

          {/* Hermana de `.motm-pcard--starter`, no su hija: así puede asomar
              un poco fuera del marco por la esquina sin arrastrar a la foto
              (que sí debe quedarse contenida) con ella. */}
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
              <span>{player.position ?? '—'}</span>
            </span>
            {seasonRating != null && (
              <span className="motm-pcard-back__row">
                <span className="motm-pcard-back__label">Media</span>
                <span>{seasonRating.toFixed(2)}</span>
              </span>
            )}
          </div>
        </div>
      </motion.div>
    </button>
  )
}
