import { createContext, useContext, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { MICRO } from '../lib/motion'

// El id del grupo viaja por contexto para que el `layoutId` del resaltado sea
// único por switcher: si dos grupos de la misma pantalla lo compartieran, la
// pastilla saltaría de un switcher al otro.
const GroupCtx = createContext('seg')

/** Switcher segmentado (Próximos/Pasados, local/visitante, periodo…). El
 *  resaltado del activo se desliza hasta la opción elegida en vez de aparecer
 *  de golpe — el mismo gesto en todos los switchers de la app. */
export function Segmented({
  id,
  ariaLabel,
  children,
}: {
  id: string
  ariaLabel: string
  children: ReactNode
}) {
  return (
    <GroupCtx.Provider value={id}>
      <div className="motm-segmented" role="group" aria-label={ariaLabel}>
        {children}
      </div>
    </GroupCtx.Provider>
  )
}

export function SegmentedButton({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  const groupId = useContext(GroupCtx)
  const reduceMotion = useReducedMotion()

  return (
    <button
      type="button"
      className="motm-segmented__btn"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
    >
      {active && (
        <motion.span
          layoutId={`motm-seg-${groupId}`}
          className="motm-segmented__pill"
          transition={reduceMotion ? { duration: 0.001 } : MICRO}
        />
      )}
      <span className="motm-segmented__label">{children}</span>
    </button>
  )
}
