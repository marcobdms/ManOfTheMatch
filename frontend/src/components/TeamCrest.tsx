import { crestFor } from '../lib/crests'
import { crestForUclTeam } from '../lib/crestsUcl'

type Props = {
  teamId: string | null | undefined
  tla: string
  color?: string | null
  size?: number
  className?: string
  /** Escudo ya resuelto por fuera. Si viene, manda sobre todo lo demás. */
  src?: string | null
  /** Nombre completo del club — permite resolver el escudo de un equipo de
   *  Champions que no tiene slug propio (llega como `ext:Nombre`). */
  name?: string | null
}

/** Escudo real (SVG) si lo tenemos; si no (hoy: Alavés), el círculo con TLA
 *  de siempre. El círculo lleva el mismo sesgo itálico que el wordmark
 *  (`--motm-tilt`) para que ambos compartan personalidad de marca. */
export default function TeamCrest({
  teamId,
  tla,
  color,
  size = 32,
  className = '',
  src: srcOverride,
  name,
}: Props) {
  const src = srcOverride ?? crestFor(teamId) ?? crestForUclTeam(name)

  if (src) {
    return (
      <span className={`motm-teamcrest ${className}`} style={{ width: size, height: size }}>
        <img src={src} alt={tla} width={size} height={size} />
      </span>
    )
  }

  return (
    <span
      className={`motm-teamcrest motm-teamcrest--fallback ${className}`}
      style={{ width: size, height: size, background: color ?? 'var(--muted)' }}
    >
      {tla}
    </span>
  )
}
