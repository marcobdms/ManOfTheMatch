import type { MatchEventType, MatchStatus } from '../lib/shared'

export type TeamLite = {
  id: string
  tla: string
  name: string
}

export type LiveMatch = {
  id: string
  competitionShort: string
  status: MatchStatus
  minuteLabel: string // "74'"
  kickoffAt: string // ISO timestamp, from fixtures.kickoff_at
  home: TeamLite
  away: TeamLite
  homeScore: number
  awayScore: number
}

export type GoalChip = {
  minuteLabel: string
  player: string
}

export type TimelineEvent = {
  id: string
  type: MatchEventType
  minuteLabel: string
  text: string
}
