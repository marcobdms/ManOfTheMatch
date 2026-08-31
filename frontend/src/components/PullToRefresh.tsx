import { useEffect, useRef, useState } from 'react'
import { ArrowClockwise } from '@phosphor-icons/react'
import { motion, useReducedMotion } from 'framer-motion'
import { useQueryClient } from '@tanstack/react-query'

const TRIGGER_PX = 64
const MAX_PULL_PX = 96

/**
 * Deslizar hacia abajo para recargar. Nativo en Android/Chrome, ausente en
 * Safari — así que ni siquiera lo limitamos a la PWA instalada: en la
 * pestaña normal de iOS falta igual. Solo se activa arrastrando desde
 * `window.scrollY === 0` (si ya hay scroll, es un scroll normal, no un
 * pull-to-refresh).
 */
export default function PullToRefresh() {
  const queryClient = useQueryClient()
  const reduceMotion = useReducedMotion()
  const [pull, setPull] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const startY = useRef<number | null>(null)

  useEffect(() => {
    function onTouchStart(e: TouchEvent) {
      if (window.scrollY > 0 || refreshing) return
      startY.current = e.touches[0]?.clientY ?? null
      setDragging(startY.current != null)
    }

    function onTouchMove(e: TouchEvent) {
      if (startY.current == null) return
      const dy = (e.touches[0]?.clientY ?? 0) - startY.current
      if (dy <= 0) {
        setPull(0)
        return
      }
      // Se frena progresivamente (raíz cuadrada) — sin esto un dedo que
      // sigue arrastrando manda el indicador muy lejos de golpe.
      setPull(Math.min(MAX_PULL_PX, Math.sqrt(dy) * 8))
    }

    async function onTouchEnd() {
      if (startY.current == null) return
      startY.current = null
      setDragging(false)
      if (pull >= TRIGGER_PX) {
        setRefreshing(true)
        try {
          await queryClient.invalidateQueries()
        } finally {
          setRefreshing(false)
        }
      }
      setPull(0)
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: true })
    window.addEventListener('touchend', onTouchEnd)
    return () => {
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
    }
  }, [pull, refreshing, queryClient])

  const visible = pull > 4 || refreshing
  const progress = Math.min(1, pull / TRIGGER_PX)

  return (
    <motion.div
      className="motm-ptr"
      // `x` fijo aquí (no en la clase CSS): framer-motion escribe `transform`
      // por `style` inline para animar `y`, y eso pisaría por completo un
      // `transform: translateX(-50%)` puesto por CSS — dejándoselo todo a
      // framer-motion, combina ambos en un solo `transform` sin pisarse.
      style={{ opacity: visible ? 1 : 0, x: '-50%' }}
      animate={{ y: refreshing ? 44 : pull * 0.6 }}
      transition={{ duration: reduceMotion || dragging ? 0 : 0.2 }}
      aria-hidden="true"
    >
      <span className="motm-ptr__icon" style={{ transform: `rotate(${progress * 360}deg)` }}>
        <ArrowClockwise size={18} weight="bold" className={refreshing ? 'motm-ptr__spin' : ''} />
      </span>
    </motion.div>
  )
}
