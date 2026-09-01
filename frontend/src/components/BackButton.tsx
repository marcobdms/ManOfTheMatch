import { ArrowLeft } from '@phosphor-icons/react'
import { motion, useReducedMotion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { MICRO } from '../lib/motion'

/** Flecha de volver, igual en todas las vistas de detalle: se hunde al
 *  pulsarla (antes cada pantalla la pintaba a mano y ninguna respondía al
 *  toque) y la vista de destino entra con el push hacia atrás de App.tsx. */
export default function BackButton() {
  const navigate = useNavigate()
  const reduceMotion = useReducedMotion()

  return (
    <motion.button
      type="button"
      className="motm-iconbtn motm-lineup__back"
      aria-label="Volver"
      onClick={() => navigate(-1)}
      whileTap={reduceMotion ? undefined : { scale: 0.85 }}
      transition={MICRO}
    >
      <ArrowLeft size={22} />
    </motion.button>
  )
}
