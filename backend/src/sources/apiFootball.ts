// Adapter: API-Football (api-sports.io direct dashboard plan) — the "scalpel":
// timeline, lineups, per-player ratings/stats. Base URL / auth / shapes: §3.2.
//   - Auth: header `x-apisports-key`
//   - Free: 100 req/day, 10/min, resets 00:00 UTC
//   - Every response is an envelope `{ get, parameters, errors, results, paging, response }`.
//     Quota / param errors come back 200 OK with a populated `errors` object — we
//     reject those before they can be cached (see `assertNoErrors`).
// Budget is guarded in the caller (jobs/syncMatchDetail.ts + lib/budget.ts); TTLs
// here just stop accidental double-fetches inside one sweep.

import { cachedJson } from '../lib/http.js';

const BASE = 'https://v3.football.api-sports.io';
const authHeaders = () => ({ 'x-apisports-key': process.env.API_FOOTBALL_KEY ?? '' });

export type ApiFootballEnvelope<T> = {
  get: string;
  parameters: Record<string, string> | unknown[];
  errors: Record<string, string> | unknown[];
  results: number;
  paging: { current: number; total: number };
  response: T[];
};

function assertNoErrors(body: unknown): void {
  const errs = (body as { errors?: unknown } | null)?.errors;
  const n = Array.isArray(errs)
    ? errs.length
    : errs && typeof errs === 'object'
      ? Object.keys(errs).length
      : 0;
  if (n > 0) throw new Error(`API-Football returned errors: ${JSON.stringify(errs)}`);
}

async function afGet<T>(url: string, ttlSeconds: number): Promise<T[]> {
  const body = await cachedJson<ApiFootballEnvelope<T>>(url, {
    headers: authHeaders(),
    ttlSeconds,
    assertOk: assertNoErrors,
  });
  return body.response ?? [];
}

// --- endpoints (api-research.md §3.2) ---------------------------------------

/**
 * Season fixtures for one team.
 * ⚠️ CONFIRMED 2026-08-27: the Free plan only serves seasons 2022–2024
 * (`errors.plan: "Free plans do not have access to this season"`), so this is
 * NOT usable for the current season. Fixture ids come from the TheSportsDB
 * cross-ref (`idAPIfootball` in syncFixtures); for live discovery use
 * `getLiveFixtures()` (`?live=all` — works on Free). Kept for a paid upgrade.
 */
export function getFixturesByTeam(teamApiId: number, season = 2024) {
  return afGet<AfFixture>(`${BASE}/fixtures?team=${teamApiId}&season=${season}`, 6 * 3600);
}

/** One fixture (live score / status). */
export function getFixtureById(fixtureApiId: number) {
  return afGet<AfFixture>(`${BASE}/fixtures?id=${fixtureApiId}`, 600);
}

/** All in-play fixtures in one call — filter to our teams client-side. */
export function getLiveFixtures() {
  return afGet<AfFixture>(`${BASE}/fixtures?live=all`, 60);
}

/** Full timeline: Goal / Card / subst / Var. TTL kept short so the live sweep
 *  (every ~5 min) gets fresh events without hammering the daily budget. */
export function getFixtureEvents(fixtureApiId: number) {
  return afGet<AfEvent>(`${BASE}/fixtures/events?fixture=${fixtureApiId}`, 240);
}

/** Formation + startXI (with grid) + substitutes + coach. */
export function getFixtureLineups(fixtureApiId: number) {
  return afGet<AfLineup>(`${BASE}/fixtures/lineups?fixture=${fixtureApiId}`, 6 * 3600);
}

/** Per-player stats incl. `statistics[0].games.rating`. TTL < the ratings-settle
 *  window so the post-FT re-sweep actually re-fetches. */
export function getFixturePlayers(fixtureApiId: number) {
  return afGet<AfPlayersTeam>(`${BASE}/fixtures/players?fixture=${fixtureApiId}`, 3600);
}

/** Team-level stats incl. (inconsistent) `expected_goals`. Fallback / future use. */
export function getFixtureStatistics(fixtureApiId: number) {
  return afGet<AfStatisticsTeam>(`${BASE}/fixtures/statistics?fixture=${fixtureApiId}`, 3600);
}

/** League table (fallback to football-data.org — not wired). */
export function getStandings(leagueApiId: number, season = 2026) {
  return afGet<AfStandingsBlock>(`${BASE}/standings?league=${leagueApiId}&season=${season}`, 3600);
}

/** Cuotas pre-partido, todas las casas en una sola llamada — filtrar la casa
 *  deseada en el caller. Vacío si aún no hay mercado abierto para el partido. */
export function getOdds(fixtureApiId: number) {
  return afGet<AfOdds>(`${BASE}/odds?fixture=${fixtureApiId}`, 1800);
}

/** Pronóstico: % de victoria/empate, forma/ataque/defensa comparados. */
export function getPredictions(fixtureApiId: number) {
  return afGet<AfPrediction>(`${BASE}/predictions?fixture=${fixtureApiId}`, 1800);
}

/** All teams in a league/season — used one-off by scripts/resolveTeamIds.ts.
 *  ⚠️ Free plan only serves seasons 2022-2024 for most endpoints
 *  (docs/endpoint-check-2026-08-27.md) — verify this works for 2026 before
 *  relying on it; fall back to a paid season or to name-matching against the
 *  football-data.org / TheSportsDB team lists if it 200s with `errors.plan`. */
export function getLeagueTeams(leagueApiId: number, season = 2026) {
  return afGet<AfTeamInfo>(`${BASE}/teams?league=${leagueApiId}&season=${season}`, 6 * 3600);
}

// --- response shapes (verified samples in api-research.md §3.2) --------------

export type AfTeamRef = { id: number | null; name: string | null; logo: string | null; winner: boolean | null };

export type AfTeamInfo = {
  team: { id: number; name: string; code: string | null; country: string | null; logo: string | null };
  venue: { id: number | null; name: string | null; city: string | null };
};

export type AfFixture = {
  fixture: {
    id: number;
    referee: string | null;
    timezone: string;
    date: string;
    timestamp: number;
    periods: { first: number | null; second: number | null };
    venue: { id: number | null; name: string | null; city: string | null };
    status: { long: string; short: string; elapsed: number | null; extra: number | null };
  };
  league: {
    id: number;
    name: string;
    country: string;
    season: number;
    round: string;
    standings?: boolean;
  };
  teams: { home: AfTeamRef; away: AfTeamRef };
  goals: { home: number | null; away: number | null };
  score: {
    halftime: { home: number | null; away: number | null };
    fulltime: { home: number | null; away: number | null };
    extratime: { home: number | null; away: number | null };
    penalty: { home: number | null; away: number | null };
  };
};

export type AfEvent = {
  time: { elapsed: number | null; extra: number | null };
  team: { id: number | null; name: string | null; logo: string | null };
  player: { id: number | null; name: string | null };
  assist: { id: number | null; name: string | null };
  type: string; // Goal | Card | subst | Var
  detail: string | null; // Normal Goal | Own Goal | Penalty | Missed Penalty | Yellow Card | ...
  comments: string | null;
};

export type AfLineupPlayer = {
  player: {
    id: number | null;
    name: string | null;
    number: number | null;
    pos: string | null; // G | D | M | F
    grid: string | null; // "row:col" from the back
  };
};

export type AfLineup = {
  team: { id: number | null; name: string | null; logo: string | null; colors: unknown };
  coach: { id: number | null; name: string | null; photo: string | null };
  formation: string | null;
  startXI: AfLineupPlayer[];
  substitutes: AfLineupPlayer[];
};

export type AfPlayerStat = {
  games: {
    minutes: number | null;
    number: number | null;
    position: string | null;
    rating: string | null; // "7.1" — string
    captain: boolean;
    substitute: boolean;
  };
  offsides: number | null;
  shots: { total: number | null; on: number | null };
  goals: { total: number | null; conceded: number | null; assists: number | null; saves: number | null };
  passes: { total: number | null; key: number | null; accuracy: string | null }; // "44%" — string
  tackles: { total: number | null; blocks: number | null; interceptions: number | null };
  duels: { total: number | null; won: number | null };
  dribbles: { attempts: number | null; success: number | null; past: number | null };
  fouls: { drawn: number | null; committed: number | null };
  cards: { yellow: number | null; red: number | null };
  penalty: {
    won: number | null;
    commited: number | null; // API-Football's spelling
    scored: number | null;
    missed: number | null;
    saved: number | null;
  };
};

export type AfPlayersTeam = {
  team: { id: number | null; name: string | null; logo: string | null; update: string | null };
  players: Array<{
    player: { id: number | null; name: string | null; photo: string | null };
    statistics: AfPlayerStat[];
  }>;
};

export type AfStatisticsTeam = {
  team: { id: number | null; name: string | null; logo: string | null };
  statistics: Array<{ type: string; value: number | string | null }>;
};

export type AfStandingsBlock = {
  league: {
    id: number;
    name: string;
    country: string;
    season: number;
    standings: Array<
      Array<{
        rank: number;
        team: { id: number; name: string; logo: string | null };
        points: number;
        goalsDiff: number;
        group: string;
        form: string | null;
        status: string;
        description: string | null;
        all: AfStandingRecord;
        home: AfStandingRecord;
        away: AfStandingRecord;
        update: string;
      }>
    >;
  };
};

type AfStandingRecord = {
  played: number;
  win: number;
  draw: number;
  lose: number;
  goals: { for: number; against: number };
};

export type AfOddsValue = { value: string; odd: string };
export type AfOddsBet = { id: number; name: string; values: AfOddsValue[] };
export type AfOddsBookmaker = { id: number; name: string; bets: AfOddsBet[] };
export type AfOdds = {
  fixture: { id: number };
  update: string;
  bookmakers: AfOddsBookmaker[];
};

export type AfPrediction = {
  predictions: {
    winner: { id: number | null; name: string | null; comment: string | null } | null;
    percent: { home: string; draw: string; away: string };
  };
  comparison: {
    form: { home: string; away: string };
    att: { home: string; away: string };
    def: { home: string; away: string };
  };
};
