import { SoccerBall } from '@phosphor-icons/react'
import type { GoalChip, LiveMatch } from '../types/view'

type Props = {
  match: LiveMatch
  goals: GoalChip[]
}

export default function ScoreboardCard({ match, goals }: Props) {
  const isLive = match.status === 'LIVE' || match.status === 'PAUSED'

  return (
    <section className="motm-score">
      <div className="motm-score__top">
        <span className="motm-label" style={{ color: 'rgba(255,255,255,.5)' }}>
          {match.competitionShort} · {isLive ? 'En directo' : 'Previa'}
        </span>
        {isLive && (
          <span
            className="motm-live"
            role="status"
            aria-atomic="true"
            aria-label={`En directo, minuto ${match.minuteLabel}`}
          >
            <span className="motm-live__dot" />
            {match.minuteLabel}
          </span>
        )}
      </div>

      <div className="motm-score__grid">
        <div className="motm-team">
          <div className="motm-crest">{match.home.tla}</div>
          <span className="motm-team__name">{match.home.name}</span>
        </div>
        <div className="motm-score__num">
          <b>{match.homeScore}</b>
          <span>–</span>
          <b>{match.awayScore}</b>
        </div>
        <div className="motm-team">
          <div className="motm-crest">{match.away.tla}</div>
          <span className="motm-team__name">{match.away.name}</span>
        </div>
      </div>

      {goals.length > 0 && (
        <div className="motm-goals" aria-label="Goles del partido">
          {goals.map((g, i) => (
            <span className="motm-goal-chip" key={i}>
              <SoccerBall size={12} weight="fill" />
              {g.minuteLabel} {g.player}
            </span>
          ))}
        </div>
      )}
    </section>
  )
}
