// Adapter: TheSportsDB v1 (free) — live-score gap filler + fixtures/standings
// fallback. Base URL / auth / shapes: api-research.md §3.3.
//   - Auth: API key is a URL path segment. Free shared test key = "123".
//   - Free: 30 req/min. `livescore.php` works on free (v2 2-min livescore is paid).
//   - Every field in the JSON comes back as a *string* (or null).
//   - Bonus: events carry `idAPIfootball` — a free TheSportsDB→API-Football id map.
// TTLs follow the polling plan §4.2: livescore ~60 s, timeline ~3 min, the rest
// is twice-daily / seasonal.

import { cachedJson } from '../lib/http.js';

const KEY = process.env.THESPORTSDB_KEY || '123';
const BASE = `https://www.thesportsdb.com/api/v1/json/${KEY}`;

/** Live soccer scores (poll ~60 s during a tracked match; filter to our idEvent). */
export function getLivescores() {
  return cachedJson<TsdbLivescoreResponse>(`${BASE}/livescore.php?s=Soccer`, { ttlSeconds: 50 });
}

/** Match timeline — goals + cards + subs (crowd-sourced, lags; re-poll). */
export function getTimeline(idEvent: string) {
  return cachedJson<TsdbTimelineResponse>(`${BASE}/lookuptimeline.php?id=${idEvent}`, {
    ttlSeconds: 150,
  });
}

/** Next ~25 matches for a team — used to cross-map TheSportsDB / API-Football ids. */
export function getEventsNext(teamId: string) {
  return cachedJson<TsdbEventsResponse>(`${BASE}/eventsnext.php?id=${teamId}`, { ttlSeconds: 3600 });
}

/** Whole-season fixtures for a league (fallback — not wired). */
export function getSeasonEvents(leagueId: string, season: string) {
  return cachedJson<TsdbEventsResponse>(`${BASE}/eventsseason.php?id=${leagueId}&s=${season}`, {
    ttlSeconds: 6 * 3600,
  });
}

/** All teams in a league — used one-off by scripts/resolveTeamIds.ts. */
export function getAllTeamsInLeague(leagueId: string) {
  return cachedJson<TsdbAllTeamsResponse>(`${BASE}/lookup_all_teams.php?id=${leagueId}`, {
    ttlSeconds: 24 * 3600,
  });
}

/** League table (fallback to football-data.org — not wired). */
export function getLeagueTable(leagueId: string, season: string) {
  return cachedJson<TsdbTableResponse>(`${BASE}/lookuptable.php?l=${leagueId}&s=${season}`, {
    ttlSeconds: 3600,
  });
}

/** Lineup for one event — no formation string (fallback — not wired). */
export function getLineup(idEvent: string) {
  return cachedJson<TsdbLineupResponse>(`${BASE}/lookuplineup.php?id=${idEvent}`, {
    ttlSeconds: 6 * 3600,
  });
}

// --- response shapes (verified samples in api-research.md §3.3) --------------

export type TsdbLiveEvent = {
  idEvent: string;
  idAPIfootball: string | null;
  strEvent: string | null;
  strHomeTeam: string | null;
  strAwayTeam: string | null;
  idHomeTeam: string | null;
  idAwayTeam: string | null;
  intHomeScore: string | null;
  intAwayScore: string | null;
  strStatus: string | null;
  strProgress: string | null; // in-play minute
  strEventTime: string | null;
  idLeague: string | null;
  strLeague: string | null;
};

export type TsdbLivescoreResponse = {
  livescore?: TsdbLiveEvent[] | null;
  events?: TsdbLiveEvent[] | null;
};

export type TsdbTimelineEvent = {
  idTimeline: string;
  idEvent: string;
  idAPIfootball: string | null;
  strTimeline: string | null; // Goal | Card | subst
  strTimelineDetail: string | null; // Normal Goal | Penalty | Own Goal | Yellow Card | Red Card
  strHome: string | null; // "Yes" = home team
  intTime: string | null;
  strPlayer: string | null;
  idPlayer: string | null;
  strAssist: string | null;
  idAssist: string | null;
  idTeam: string | null;
  strTeam: string | null;
  strComment: string | null;
  strSeason: string | null;
};

export type TsdbTimelineResponse = { timeline: TsdbTimelineEvent[] | null };

export type TsdbEvent = {
  idEvent: string;
  idAPIfootball: string | null;
  strEvent: string | null;
  strTimestamp: string | null;
  dateEvent: string | null;
  strTime: string | null;
  strSeason: string | null;
  idLeague: string | null;
  strLeague: string | null;
  intRound: string | null;
  strHomeTeam: string | null;
  idHomeTeam: string | null;
  strAwayTeam: string | null;
  idAwayTeam: string | null;
  intHomeScore: string | null;
  intAwayScore: string | null;
  idVenue: string | null;
  strVenue: string | null;
  strCountry: string | null;
  strStatus: string | null;
  strPostponed: string | null;
};

export type TsdbEventsResponse = { events: TsdbEvent[] | null };

export type TsdbTeam = {
  idTeam: string;
  strTeam: string;
  strTeamShort: string | null;
  strAlternate: string | null;
};

export type TsdbAllTeamsResponse = { teams: TsdbTeam[] | null };

export type TsdbTableRow = {
  intRank: string;
  idTeam: string;
  strTeam: string;
  strLeague: string | null;
  strSeason: string | null;
  strGroup: string | null;
  intPlayed: string;
  intWin: string;
  intDraw: string;
  intLoss: string;
  intGoalsFor: string;
  intGoalsAgainst: string;
  intGoalDifference: string;
  intPoints: string;
  strForm: string | null;
  dateUpdated: string | null;
};

export type TsdbTableResponse = { table: TsdbTableRow[] | null };

export type TsdbLineupRow = {
  idLineup: string;
  idEvent: string;
  strPosition: string | null; // free text
  strHome: string | null;
  strSubstitute: string | null; // "Yes" for bench
  intSquadNumber: string | null;
  strPlayer: string | null;
  idPlayer: string | null;
  idTeam: string | null;
  strTeam: string | null;
};

export type TsdbLineupResponse = { lineup: TsdbLineupRow[] | null };
