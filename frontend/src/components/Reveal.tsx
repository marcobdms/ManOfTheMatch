import type { ReactNode } from 'react'

type Props = {
  /** true cuando TODO lo que contiene la sección ya ha cargado. */
  ready: boolean
  skeleton: ReactNode
  children: ReactNode
}

/** Una sección de pantalla: esqueleto hasta que está todo, y entonces aparece
 *  entera de una vez (en vez de que cada pieza entre por su cuenta). */
export default function Reveal({ ready, skeleton, children }: Props) {
  if (!ready) return <>{skeleton}</>
  return <div className="motm-reveal">{children}</div>
}

/** Bloque gris con shimmer; `margin` a 0 por defecto para encajar en cualquier sección. */
export function SkelBlock({ height, margin = 0 }: { height: number; margin?: number | string }) {
  return <div className="motm-skel" style={{ height, margin }} aria-hidden="true" />
}
