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

/**
 * Los 31 clubes de la fase liga de Champions que NO son de LaLiga (los 5
 * españoles reutilizan su entrada de TEAMS). `id` = fila en `teams` (0019) y
 * basename del SVG en assets/crests/ucl/. No entran en TRACKED_TEAM_IDS: no
 * son "equipos seguidos" a efectos de favorito / filtro de En vivo.
 */
export const UCL_TEAMS = {
  'aek-athens': { id: 'aek-athens', tla: 'AEK', name: 'PAE AEK' },
  arsenal: { id: 'arsenal', tla: 'ARS', name: 'Arsenal FC' },
  roma: { id: 'roma', tla: 'ROM', name: 'AS Roma' },
  'aston-villa': { id: 'aston-villa', tla: 'AVL', name: 'Aston Villa FC' },
  'bayern-munich': { id: 'bayern-munich', tla: 'BAY', name: 'FC Bayern München' },
  'borussia-dortmund': { id: 'borussia-dortmund', tla: 'BVB', name: 'Borussia Dortmund' },
  'club-brugge': { id: 'club-brugge', tla: 'BRU', name: 'Club Brugge KV' },
  'como-1907': { id: 'como-1907', tla: 'COM', name: 'Como 1907' },
  'fc-porto': { id: 'fc-porto', tla: 'POR', name: 'FC Porto' },
  fenerbahce: { id: 'fenerbahce', tla: 'FEN', name: 'Fenerbahçe SK' },
  feyenoord: { id: 'feyenoord', tla: 'FEY', name: 'Feyenoord Rotterdam' },
  'fk-bodo-glimt': { id: 'fk-bodo-glimt', tla: 'BOD', name: 'FK Bodø/Glimt' },
  galatasaray: { id: 'galatasaray', tla: 'GAL', name: 'Galatasaray SK' },
  'inter-milan': { id: 'inter-milan', tla: 'INT', name: 'FC Internazionale Milano' },
  lask: { id: 'lask', tla: 'LAS', name: 'LASK Linz' },
  'losc-lille': { id: 'losc-lille', tla: 'LIL', name: 'Lille OSC' },
  'liverpool-fc': { id: 'liverpool-fc', tla: 'LIV', name: 'Liverpool FC' },
  'manchester-city': { id: 'manchester-city', tla: 'MCI', name: 'Manchester City FC' },
  'manchester-united': { id: 'manchester-united', tla: 'MUN', name: 'Manchester United FC' },
  'paris-saint-germain-psg': { id: 'paris-saint-germain-psg', tla: 'PSG', name: 'Paris Saint-Germain FC' },
  'psv-eindhoven': { id: 'psv-eindhoven', tla: 'PSV', name: 'PSV' },
  'rb-leipzig': { id: 'rb-leipzig', tla: 'RBL', name: 'RB Leipzig' },
  'rc-lens': { id: 'rc-lens', tla: 'LEN', name: 'Racing Club de Lens' },
  'sabah-fk': { id: 'sabah-fk', tla: 'SAB', name: 'Sabah FK' },
  'shakhtar-donetsk': { id: 'shakhtar-donetsk', tla: 'SHK', name: 'FK Shakhtar Donetsk' },
  'slavia-praha': { id: 'slavia-praha', tla: 'SLA', name: 'SK Slavia Praha' },
  'slovan-bratislava': { id: 'slovan-bratislava', tla: 'SLB', name: 'ŠK Slovan Bratislava' },
  'sporting-cp': { id: 'sporting-cp', tla: 'SPO', name: 'Sporting Clube de Portugal' },
  napoli: { id: 'napoli', tla: 'NAP', name: 'SSC Napoli' },
  'vfb-stuttgart': { id: 'vfb-stuttgart', tla: 'STU', name: 'VfB Stuttgart' },
  'viking-fk': { id: 'viking-fk', tla: 'VIK', name: 'Viking FK' },
} as const;

export type UclOnlyTeamId = keyof typeof UCL_TEAMS;
/** Cualquier club conocido: 20 de LaLiga + 31 de Champions. */
export type AnyTeamId = TeamId | UclOnlyTeamId;

/** id -> {tla,name} de los 51 clubes (LaLiga + Champions). */
export const ALL_TEAMS: Record<string, { id: string; tla: string; name: string }> = {
  ...TEAMS,
  ...UCL_TEAMS,
};

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
