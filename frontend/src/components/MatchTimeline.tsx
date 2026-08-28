import type { JSX } from 'react'
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
              <span className="motm-ev__txt">{e.text}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
