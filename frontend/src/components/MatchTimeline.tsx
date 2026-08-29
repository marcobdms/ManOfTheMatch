import type { JSX } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowsLeftRight,
  FlagPennant,
  PaperPlaneTilt,
  SoccerBall,
} from '@phosphor-icons/react'
import type { MatchEventType } from '../lib/shared'
import type { TimelineEvent } from '../types/view'

function badge(type: MatchEventType): { cls: string; node: JSX.Element } {
  switch (type) {
    case 'GOAL':
    case 'OWN_GOAL':
    case 'PENALTY_GOAL':
      return { cls: ' motm-ev__badge--goal', node: <SoccerBall size={15} weight="fill" /> }
    case 'YELLOW':
    case 'SECOND_YELLOW':
      return {
        cls: ' motm-ev__badge--card',
        node: <span style={{ width: 11, height: 15, borderRadius: 2, background: 'var(--yellow)' }} />,
      }
    case 'RED':
      return {
        cls: ' motm-ev__badge--card',
        node: <span style={{ width: 11, height: 15, borderRadius: 2, background: 'var(--brand)' }} />,
      }
    case 'SUB':
      return { cls: '', node: <ArrowsLeftRight size={15} /> }
    case 'CORNER':
      return { cls: '', node: <FlagPennant size={15} /> }
    default:
      return { cls: '', node: <PaperPlaneTilt size={15} /> }
  }
}

// Un evento nuevo (gol recién llegado por realtime) entra deslizándose desde
// la izquierda — llama la atención sin ser un simple fade genérico.
const eventVariants = {
  initial: { opacity: 0, x: -10 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.22, ease: 'easeOut' as const } },
  exit: { opacity: 0, transition: { duration: 0.12 } },
}

export default function MatchTimeline({ events }: { events: TimelineEvent[] }) {
  return (
    <div className="motm-timeline">
      <span className="motm-label" style={{ letterSpacing: '.1em', color: 'var(--ink)' }}>
        Histórico del partido
      </span>
      <div style={{ marginTop: 8 }}>
        <AnimatePresence initial={false}>
          {events.map((e) => {
            const b = badge(e.type)
            const isGoal = e.type.includes('GOAL')
            return (
              // Sin `layout`: los eventos nuevos entran por arriba y los demás
              // solo se desplazan hacia abajo. Animar esa recolocación en las
              // 20-30 filas a la vez se veía como que la lista entera "salta".
              <motion.div
                className="motm-ev"
                key={e.id}
                variants={eventVariants}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                <span className={'motm-ev__badge' + b.cls}>{b.node}</span>
                <span className={'motm-ev__min' + (isGoal ? ' motm-ev__min--goal' : '')}>
                  {e.minuteLabel}
                </span>
                <span className="motm-ev__txt">{e.text}</span>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </div>
  )
}
