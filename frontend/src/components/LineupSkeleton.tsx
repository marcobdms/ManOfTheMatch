// Esqueleto de carga para la ficha de equipo: silueta de cancha 4-3-3 con 11
// cartas fantasma (mismo shimmer que el resto de la app) en vez de un bloque
// gris genérico — da una pista visual de lo que está por llegar.
const SLOTS: Array<{ x: number; y: number }> = [
  { x: 0.1, y: 0.5 },
  { x: 0.32, y: 0.18 },
  { x: 0.32, y: 0.4 },
  { x: 0.32, y: 0.6 },
  { x: 0.32, y: 0.82 },
  { x: 0.58, y: 0.28 },
  { x: 0.58, y: 0.5 },
  { x: 0.58, y: 0.72 },
  { x: 0.85, y: 0.2 },
  { x: 0.85, y: 0.5 },
  { x: 0.85, y: 0.8 },
]

export default function LineupSkeleton() {
  return (
    <div className="motm-lineup-skel" aria-hidden="true">
      {SLOTS.map((slot, i) => (
        <span
          key={i}
          className="motm-lineup-skel__card"
          style={{ left: `${slot.y * 100}%`, bottom: `${slot.x * 100}%` }}
        />
      ))}
    </div>
  )
}
