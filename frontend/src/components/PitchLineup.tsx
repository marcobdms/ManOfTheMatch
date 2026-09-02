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
 *  Las cartas entraban escalonadas, pero eran 11 animaciones simultáneas
 *  —cada una con su foto y su cara 3D— en cada montaje de la vista: era de
 *  lo más caro que hacía la app al navegar. Ahora se pintan y ya. */
export default function PitchLineup({ starters }: Props) {
  return (
    <div className="motm-pitch">
      <img src={pitchPhoto} alt="" className="motm-pitch__photo" aria-hidden="true" />
      <div className="motm-pitch__veil" aria-hidden="true" />
      <div className="motm-pitch__field">
        {starters.map((p, i) => (
          <div
            key={`${p.name}-${i}`}
            className="motm-pitch__slot"
            style={{ left: `${p.y * 100}%`, bottom: `${p.x * 100}%` }}
          >
            <PlayerCard player={p} variant="starter" />
          </div>
        ))}
      </div>
    </div>
  )
}
