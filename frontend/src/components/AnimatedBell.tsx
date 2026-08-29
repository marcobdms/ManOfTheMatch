import { Bell, BellRinging } from '@phosphor-icons/react'
import { motion } from 'framer-motion'

/**
 * Campana que "repica" al encenderse. Un solo elemento que cambia de icono y
 * se anima con `key` — nada de AnimatePresence con `mode="wait"`, que dejaba
 * el botón visualmente vacío durante el cruce (la vieja se iba antes de que
 * entrara la nueva) y se percibía como un parpadeo.
 */
export default function AnimatedBell({ active, size = 20 }: { active: boolean; size?: number }) {
  return (
    <motion.span
      key={active ? 'on' : 'off'}
      initial={{ scale: 0.7, rotate: active ? -20 : 0 }}
      animate={{ scale: 1, rotate: 0 }}
      transition={{ type: 'spring', stiffness: 520, damping: 14 }}
      style={{ display: 'inline-flex' }}
    >
      {active ? <BellRinging size={size} /> : <Bell size={size} />}
    </motion.span>
  )
}
