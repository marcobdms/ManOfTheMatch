// Adapter: football-data.org (v4) — PRIMARY for calendar + standings (free forever).
// Base URL / auth / rate limit / exact response shapes: api-research.md §3.1.
//   - Auth: header `X-Auth-Token`
//   - Free: 10 req/min, no daily cap; scores & schedules are *delayed* (not live);
//     no event / lineup / squad arrays on free.
// TTLs follow the polling plan (§4): calendar + standings sync twice a day, so an
// hour of cache is plenty; the single-match poll is tuned for the live loop.

import { cachedJson } from '../lib/http.js';

const BASE = 'https://api.football-data.org/v4';
const authHeaders = () => ({ 'X-Auth-Token': process.env.FOOTBALL_DATA_TOKEN ?? '' });

/** All matches of a competition for a season. `code`: 'PD' (LaLiga) | 'CL' (Champions). */
export function getCompetitionMatches(code: 'PD' | 'CL', season = 2026) {
  return cachedJson<FootballDataMatches>(
    `${BASE}/competitions/${code}/matches?season=${season}`,
    { headers: authHeaders(), ttlSeconds: 3600 },
  );
}

/** All teams in a competition — used one-off by scripts/resolveTeamIds.ts. */
export function getCompetitionTeams(code: 'PD' | 'CL', season = 2026) {
  return cachedJson<FootballDataTeams>(
    `${BASE}/competitions/${code}/teams?season=${season}`,
    { headers: authHeaders(), ttlSeconds: 6 * 3600 },
  );
}

/** Matches for a single team across competitions (api-research.md §3.1). */
export function getTeamMatches(teamId: number, season = 2026) {
  return cachedJson<FootballDataMatches>(
    `${BASE}/teams/${teamId}/matches?season=${season}`,
    { headers: authHeaders(), ttlSeconds: 3600 },
  );
}

/** League table for a competition (TOTAL / HOME / AWAY blocks; CL = one 36-row table). */
export function getStandings(code: 'PD' | 'CL', season = 2026) {
  return cachedJson<FootballDataStandings>(
    `${BASE}/competitions/${code}/standings?season=${season}`,
    { headers: authHeaders(), ttlSeconds: 3600 },
  );
}

/** Single match — used by the live loop for near-live score/status. Delayed on free. */
export function getMatch(id: number | string) {
  return cachedJson<FootballDataMatch>(`${BASE}/matches/${id}`, {
    headers: authHeaders(),
    ttlSeconds: 90,
  });
}

// --- response shapes (verified samples in api-research.md §3.1) ---------------

export type FootballDataStatus =
  | 'SCHEDULED'
  | 'TIMED'
  | 'IN_PLAY'
  | 'PAUSED'
  | 'FINISHED'
  | 'SUSPENDED'
  | 'POSTPONED'
  | 'CANCELLED'
  | 'AWARDED';

export type FootballDataTeamRef = {
  id: number | null;
  name: string | null;
  shortName: string | null;
  tla: string | null;
  crest: string | null;
};

export type FootballDataScore = {
  winner: 'HOME_TEAM' | 'AWAY_TEAM' | 'DRAW' | null;
  duration: string;
  fullTime: { home: number | null; away: number | null };
  halfTime: { home: number | null; away: number | null };
};

export type FootballDataMatch = {
  area?: { id: number; name: string; code: string };
  competition?: { id: number; name: string; code: string; type: string };
  season?: {
    id: number;
    startDate: string;
    endDate: string;
    currentMatchday: number | null;
    winner: unknown;
  };
  id: number;
  utcDate: string;
  status: FootballDataStatus;
  matchday: number | null;
  stage: string;
  group: string | null;
  lastUpdated: string;
  /** Paid "Deep Data" detail — usually absent on the free tier. */
  minute?: number | null;
  venue?: string | null;
  homeTeam: FootballDataTeamRef;
  awayTeam: FootballDataTeamRef;
  score: FootballDataScore;
};

export type FootballDataTeams = {
  count: number;
  competition: { id: number; name: string; code: string };
  season: { id: number; startDate: string; endDate: string };
  teams: Array<{
    id: number;
    name: string;
    shortName: string | null;
    tla: string | null;
    crest: string | null;
  }>;
};

export type FootballDataMatches = {
  filters: Record<string, unknown>;
  resultSet: { count: number; first: string | null; last: string | null; played: number };
  competition: { id: number; name: string; code: string; type: string };
  matches: FootballDataMatch[];
};

export type FootballDataStandingRow = {
  position: number;
  team: FootballDataTeamRef & { id: number };
  playedGames: number;
  form: string | null;
  won: number;
  draw: number;
  lost: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
};

export type FootballDataStandings = {
  competition: { id: number; code: string; name: string };
  season: { id: number; currentMatchday: number | null; startDate?: string; endDate?: string };
  standings: Array<{
    stage: string;
    type: 'TOTAL' | 'HOME' | 'AWAY';
    group: string | null;
    table: FootballDataStandingRow[];
  }>;
};
