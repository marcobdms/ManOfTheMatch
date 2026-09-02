import type { JSX } from 'react'
import {
  ArrowsLeftRight,
  FlagPennant,
  Microphone,
  PaperPlaneTilt,
  SoccerBall,
  Target,
  XCircle,
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
    case 'VAR':
      return { cls: ' motm-ev__badge--goal', node: <XCircle size={15} weight="fill" /> }
    case 'CHANCE':
      return { cls: '', node: <Target size={15} /> }
    case 'INSIGHT':
      return { cls: ' motm-ev__badge--insight', node: <Microphone size={15} weight="fill" /> }
    case 'CORNER':
      return { cls: '', node: <FlagPennant size={15} /> }
    default:
      return { cls: '', node: <PaperPlaneTilt size={15} /> }
  }
}

/** Histórico del partido. Sin animación de entrada: eran 20-30 filas
 *  animándose a la vez cada vez que se abría la vista, y el coste se pagaba
 *  justo en el momento de navegar. */
export default function MatchTimeline({ events }: { events: TimelineEvent[] }) {
  return (
    <div className="motm-timeline">
      <span className="motm-label" style={{ letterSpacing: '.1em', color: 'var(--ink)' }}>
        Histórico del partido
      </span>
      <div style={{ marginTop: 8 }}>
        {events.map((e) => {
          const b = badge(e.type)
          const isGoal = e.type.includes('GOAL')
          return (
            <div className="motm-ev" key={e.id}>
              <span className={'motm-ev__badge' + b.cls}>{b.node}</span>
              <span className={'motm-ev__min' + (isGoal ? ' motm-ev__min--goal' : '')}>
                {e.minuteLabel}
              </span>
              <span className="motm-ev__txt">
                {e.narration ? (
                  // Frase de Groq (backend/lib/narrate.ts) — itálica, mismo
                  // guiño visual que "Previsión IA": marca que esa línea la
                  // puso la IA, no el dato plano de siempre.
                  <span className="motm-ev__narration">{e.narration}</span>
                ) : (
                  e.text
                )}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
