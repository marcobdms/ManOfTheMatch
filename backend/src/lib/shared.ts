// Shared constants & types for ManOfTheMatch. Duplicated verbatim in
// frontend/src/lib/shared.ts (frontend/backend deploy independently, no
// shared npm package) — keep both copies in sync by hand.
// Source ids (footballData / apiFootball / theSportsDb numeric/string ids per
// team) are NOT hardcoded here — they live in `teams.source_ids` (Supabase),
// populated by `backend/src/scripts/resolveTeamIds.ts` and refreshed at
// ingest boot (see `backend/src/lib/ids.ts`). This file only carries the
// stable, code-time-safe identity: the 20 LaLiga slugs + display names.
// See docs/handoff-schema-notify.md for why.

export const COMPETITIONS = {
  laliga: { id: 'laliga', name: 'LaLiga', footballData: 'PD', apiFootball: 140, theSportsDb: '4335' },
  ucl: { id: 'ucl', name: 'Champions', footballData: 'CL', apiFootball: 2, theSportsDb: '4480' },
} as const;

export type CompetitionId = keyof typeof COMPETITIONS;

/** The 20 LaLiga EA Sports 2026/27 clubs. `id` is the DB slug (`teams.id`). */
export const TEAMS = {
  'real-madrid': { id: 'real-madrid', tla: 'RMA', name: 'Real Madrid CF' },
  barcelona: { id: 'barcelona', tla: 'BAR', name: 'FC Barcelona' },
  'atletico-madrid': { id: 'atletico-madrid', tla: 'ATM', name: 'Club Atlético de Madrid' },
  'athletic-bilbao': { id: 'athletic-bilbao', tla: 'ATH', name: 'Athletic Club' },
  villarreal: { id: 'villarreal', tla: 'VIL', name: 'Villarreal CF' },
  'real-betis': { id: 'real-betis', tla: 'BET', name: 'Real Betis Balompié' },
  'celta-vigo': { id: 'celta-vigo', tla: 'CEL', name: 'RC Celta de Vigo' },
  'rayo-vallecano': { id: 'rayo-vallecano', tla: 'RAY', name: 'Rayo Vallecano' },
  osasuna: { id: 'osasuna', tla: 'OSA', name: 'CA Osasuna' },
  'real-sociedad': { id: 'real-sociedad', tla: 'RSO', name: 'Real Sociedad de Fútbol' },
  sevilla: { id: 'sevilla', tla: 'SEV', name: 'Sevilla FC' },
  valencia: { id: 'valencia', tla: 'VAL', name: 'Valencia CF' },
  getafe: { id: 'getafe', tla: 'GET', name: 'Getafe CF' },
  alaves: { id: 'alaves', tla: 'ALA', name: 'Deportivo Alavés' },
  espanyol: { id: 'espanyol', tla: 'ESP', name: 'RCD Espanyol' },
  levante: { id: 'levante', tla: 'LEV', name: 'Levante UD' },
  elche: { id: 'elche', tla: 'ELX', name: 'Elche CF' },
  'racing-santander': { id: 'racing-santander', tla: 'RAC', name: 'Real Racing Club' },
  deportivo: { id: 'deportivo', tla: 'DEP', name: 'RC Deportivo' },
  malaga: { id: 'malaga', tla: 'MAL', name: 'Málaga CF' },
} as const;

export type TeamId = keyof typeof TEAMS;

/** All 20 — every LaLiga club is synced now, not just Madrid/Barça. */
export const TRACKED_TEAM_IDS: TeamId[] = Object.keys(TEAMS) as TeamId[];

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
  | 'CHANCE'
  | 'WOODWORK'
  /** Momento comentado por el narrador (backend/src/jobs/syncInsights.ts):
   *  asedio, paradón, remontada… No es un evento del partido, es lectura. */
  | 'INSIGHT';

export type NotificationType = 'MATCHDAY' | 'KICKOFF_SOON' | 'LINEUP' | 'GOAL';

/** Keys of `push_subscriptions.prefs` — one per NotificationType, lowercased. */
export type PushPrefKey = 'matchday' | 'kickoff' | 'lineup' | 'goals';

// Polling cadence for the ingest worker, tuned to stay inside free API tiers.
export const POLL = {
  /** No LaLiga match in the ±2h window: sync calendar/standings twice a day. */
  idleCron: '0 6,18 * * *',
  /** From T-2h before any kickoff: refresh lineups/prematch. */
  prematchMinutes: 15,
  /** While a match is LIVE: score + events. */
  liveSeconds: 60,
} as const;
