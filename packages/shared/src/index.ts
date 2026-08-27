// Shared constants & types for ManOfTheMatch (web + ingest).
// Source ids are best-effort and get confirmed in docs/api-research.md.

export const COMPETITIONS = {
  laliga: { id: 'laliga', name: 'LaLiga', footballData: 'PD', apiFootball: 140, theSportsDb: '4335' },
  ucl: { id: 'ucl', name: 'Champions', footballData: 'CL', apiFootball: 2, theSportsDb: '4480' },
} as const;

export type CompetitionId = keyof typeof COMPETITIONS;

export const TEAMS = {
  'real-madrid': { id: 'real-madrid', tla: 'RMA', name: 'Real Madrid', footballData: 86, apiFootball: 541, theSportsDb: '133738' },
  barcelona: { id: 'barcelona', tla: 'BAR', name: 'Barcelona', footballData: 81, apiFootball: 529, theSportsDb: '133739' },
} as const;

export type TeamId = keyof typeof TEAMS;

export const TRACKED_TEAM_IDS: TeamId[] = ['real-madrid', 'barcelona'];

export const CURRENT_SEASON = '2026-27';

export type MatchStatus =
  | 'SCHEDULED'
  | 'LIVE'
  | 'PAUSED'
  | 'FINISHED'
  | 'POSTPONED'
  | 'SUSPENDED';

export type MatchEventType =
  | 'GOAL'
  | 'OWN_GOAL'
  | 'PENALTY_GOAL'
  | 'PENALTY_MISS'
  | 'YELLOW'
  | 'SECOND_YELLOW'
  | 'RED'
  | 'SUB'
  | 'VAR'
  | 'PERIOD'
  | 'CORNER'
  | 'KEY_PASS'
  | 'CHANCE';

export type NotificationType = 'MATCHDAY' | 'KICKOFF_SOON' | 'GOAL';

// Polling cadence for the ingest worker, tuned to stay inside free API tiers.
export const POLL = {
  /** No tracked match today: sync calendar/standings twice a day. */
  idleCron: '0 6,18 * * *',
  /** From T-2h before a tracked kickoff: refresh lineups/prematch. */
  prematchMinutes: 15,
  /** While a tracked match is LIVE: score + events. */
  liveSeconds: 60,
} as const;
