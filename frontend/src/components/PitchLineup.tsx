import { motion } from 'framer-motion'
import { STAGGER_ITEM } from '../lib/motion'
import pitchPhoto from '../assets/pitch.jpg'
import PlayerCard from './PlayerCard'
import type { LineupPlayer } from '../types/view'

type Props = {
  starters: LineupPlayer[]
}

/** Cancha de fondo (foto real, plan §A4 — nada de dibujar el campo con
 *  CSS/SVG) con los 11 titulares posicionados según sus coordenadas reales
 *  de Fotmob. `x`: 0 = línea de fondo propia, 1 = ataque → mapea a `bottom`
 *  (el portero queda abajo, los delanteros arriba). `y`: 0 = banda
 *  izquierda, 1 = derecha → mapea a `left` directamente.
 *
 *  Las 11 cartas entran escalonadas de defensa a ataque (mismo orden en que
 *  llegan del snapshot: portero primero) — un "line-up reveal" con más
 *  personalidad que un fade simultáneo de las 11 a la vez. */
export default function PitchLineup({ starters }: Props) {
  return (
    <div className="motm-pitch">
      <img src={pitchPhoto} alt="" className="motm-pitch__photo" aria-hidden="true" />
      <div className="motm-pitch__veil" aria-hidden="true" />
      <div className="motm-pitch__field">
        {starters.map((p, i) => (
          // El posicionamiento (translate -50%/50%) vive en el div CSS de
          // siempre — Framer Motion anima solo el hijo, para no pisar ese
          // transform con el suyo propio (scale/opacity van a otra capa).
          <div key={`${p.name}-${i}`} className="motm-pitch__slot" style={{ left: `${p.y * 100}%`, bottom: `${p.x * 100}%` }}>
            <motion.div
              initial={{ opacity: 0, scale: 0.82 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.04, ...STAGGER_ITEM }}
            >
              <PlayerCard player={p} variant="starter" />
            </motion.div>
          </div>
        ))}
      </div>
    </div>
  )
}
