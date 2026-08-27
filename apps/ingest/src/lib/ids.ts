// Source-id resolution. The per-source ids (footballData / apiFootball /
// theSportsDb) live on the `@motm/shared` constants; this module just indexes
// them for reverse lookups. The season-string helper stays local (ingest-only).

import { COMPETITIONS, TEAMS } from '@motm/shared';
import type { CompetitionId, TeamId } from '@motm/shared';

/** TheSportsDB team ids (api-research.md §3.3 / §6.3). */
export const TEAM_TSDB_ID: Record<TeamId, string> = {
  'real-madrid': TEAMS['real-madrid'].theSportsDb,
  barcelona: TEAMS.barcelona.theSportsDb,
};

/** TheSportsDB league ids (api-research.md §3.3 / §6.1). */
export const COMP_TSDB_ID: Record<CompetitionId, string> = {
  laliga: COMPETITIONS.laliga.theSportsDb,
  ucl: COMPETITIONS.ucl.theSportsDb,
};

const TEAM_LIST = Object.values(TEAMS);
const COMP_LIST = Object.values(COMPETITIONS);

const toNum = (v: number | string | null | undefined): number | null => {
  if (v == null || v === '') return null;
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
};

export function teamSlugByFootballDataId(id: number | string | null | undefined): TeamId | null {
  const n = toNum(id);
  return n == null ? null : (TEAM_LIST.find((t) => t.footballData === n)?.id as TeamId | undefined) ?? null;
}

export function teamSlugByApiFootballId(id: number | string | null | undefined): TeamId | null {
  const n = toNum(id);
  return n == null ? null : (TEAM_LIST.find((t) => t.apiFootball === n)?.id as TeamId | undefined) ?? null;
}

export function teamSlugByTsdbId(id: string | null | undefined): TeamId | null {
  if (!id) return null;
  const hit = (Object.entries(TEAM_TSDB_ID) as [TeamId, string][]).find(([, v]) => v === id);
  return hit ? hit[0] : null;
}

export function compSlugByFootballDataCode(code: string | null | undefined): CompetitionId | null {
  if (!code) return null;
  return (COMP_LIST.find((c) => c.footballData === code)?.id as CompetitionId | undefined) ?? null;
}

export function compSlugByApiFootballId(id: number | string | null | undefined): CompetitionId | null {
  const n = toNum(id);
  return n == null ? null : (COMP_LIST.find((c) => c.apiFootball === n)?.id as CompetitionId | undefined) ?? null;
}

export function isTrackedSlug(slug: string | null | undefined): slug is TeamId {
  return slug === 'real-madrid' || slug === 'barcelona';
}

export function teamName(slug: string | null | undefined): string | null {
  return isTrackedSlug(slug) ? TEAMS[slug].name : null;
}

/** '2026-27' → '2026-2027' (TheSportsDB season-string format). */
export function tsdbSeason(season: string): string {
  const start = Number(season.split('-')[0]);
  return Number.isFinite(start) ? `${start}-${start + 1}` : season;
}
