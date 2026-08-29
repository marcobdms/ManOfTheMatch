import type { ReactNode } from 'react'
import { motion } from 'framer-motion'

// Contenedor de lista con entrada escalonada — `staggerChildren` con techo:
// nunca más de 12 filas escalonadas, así una lista larga (Equipos tiene 20)
// no acumula un delay creciente sin límite en la última fila.
const MAX_STAGGERED = 12

function containerVariant(childCount: number) {
  const stagger = childCount > 0 ? Math.min(0.03, 0.3 / Math.min(childCount, MAX_STAGGERED)) : 0.03
  return {
    hidden: {},
    show: { transition: { staggerChildren: stagger, delayChildren: 0.01 } },
  }
}

const item = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: 0.22, ease: 'easeOut' as const } },
}

export function StaggerList({ children, className }: { children: ReactNode; className?: string }) {
  const count = Array.isArray(children) ? children.length : 1

  // `initial` solo se evalúa al montar, así que la entrada escalonada corre
  // una vez por visita a la vista y NO se repite en cada refetch de React
  // Query (que era lo que hacía parpadear la lista sola).
  return (
    <motion.ul className={className} variants={containerVariant(count)} initial="hidden" animate="show">
      {children}
    </motion.ul>
  )
}

export function StaggerItem({ children }: { children: ReactNode }) {
  return <motion.li variants={item}>{children}</motion.li>
}
