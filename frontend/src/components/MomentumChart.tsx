import type { TeamLite } from '../types/view'
import type { MomentumPoint } from '../types/view'

type Props = {
  points: MomentumPoint[]
  home: TeamLite
  away: TeamLite
}

// SVG a medida, sin librería de charts — barras divergentes verticales tipo
// Fotmob: valor positivo empuja hacia arriba (color local), negativo hacia
// abajo (color visitante). Ligero: un solo <svg> con <rect>, nada de canvas
// ni animaciones por fotograma.
const HEIGHT = 120
const MID = HEIGHT / 2

function barColor(value: number): string {
  return value >= 0 ? 'var(--brand)' : 'var(--ink)'
}

/** Gráfico de momentum — lo más pedido por el usuario. Sin datos, no se monta
 *  (MatchStats decide el estado vacío) para no dibujar un SVG en blanco. */
export default function MomentumChart({ points, home, away }: Props) {
  if (points.length === 0) return null

  const maxAbs = Math.max(1, ...points.map((p) => Math.abs(p.value)))
  const barWidth = 100 / points.length

  return (
    <div className="motm-momentum">
      <div className="motm-momentum__head">
        <span className="motm-momentum__team">{home.shortName}</span>
        <span className="motm-label motm-momentum__title">Momentum</span>
        <span className="motm-momentum__team motm-momentum__team--away">{away.shortName}</span>
      </div>

      <svg
        className="motm-momentum__svg"
        viewBox={`0 0 100 ${HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Momentum del partido: barras por minuto, positivo a favor de ${home.shortName}, negativo a favor de ${away.shortName}`}
      >
        <line x1="0" y1={MID} x2="100" y2={MID} className="motm-momentum__axis" />
        {points.map((p, i) => {
          const h = (Math.abs(p.value) / maxAbs) * (MID - 4)
          const x = i * barWidth
          const y = p.value >= 0 ? MID - h : MID
          return (
            <rect
              key={p.minute}
              x={x}
              y={y}
              width={Math.max(barWidth - 0.3, 0.4)}
              height={Math.max(h, 0.6)}
              fill={barColor(p.value)}
              opacity={0.4 + (Math.abs(p.value) / maxAbs) * 0.6}
            />
          )
        })}
      </svg>

      <div className="motm-momentum__axis-labels">
        <span>0'</span>
        <span>45'</span>
        <span>90'</span>
      </div>
    </div>
  )
}
