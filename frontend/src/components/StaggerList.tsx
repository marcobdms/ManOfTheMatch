import type { ReactNode } from 'react'

/**
 * Lista simple. Antes revelaba sus filas de forma escalonada con
 * framer-motion, pero eso corría en CADA montaje: al cambiar de pestaña se
 * animaban a la vez las 20 filas de Equipos, las de la clasificación o las
 * del histórico, y con el hilo principal ocupado el cambio de sección se
 * sentía trabado (o directamente no llegaba a pintarse si se tocaba rápido).
 *
 * Se conserva el componente —y su API— para no tocar las seis vistas que lo
 * usan, y para tener un solo sitio donde volver a meter una entrada si algún
 * día se hace sin coste.
 */
export function StaggerList({ children, className }: { children: ReactNode; className?: string }) {
  return <ul className={className}>{children}</ul>
}

export function StaggerItem({ children }: { children: ReactNode }) {
  return <li>{children}</li>
}
