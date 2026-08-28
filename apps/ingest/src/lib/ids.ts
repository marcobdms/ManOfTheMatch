// Source-id resolution. Team slugs/names are static (`@motm/shared`), but the
// per-source numeric/string ids (footballData / apiFootball / theSportsDb) now
// live in `teams.source_ids` (Supabase) — not hardcoded here — so all 20
// LaLiga clubs work without guessing ids at code-time. See
// docs/handoff-schema-notify.md §2. `refreshTeamCache()` loads them into an
// in-memory index; callers stay synchronous.

import { COMPETITIONS, TEAMS } from '@motm/shared';
import type { CompetitionId, TeamId } from '@motm/shared';
import { db } from '../db.js';

/** TheSportsDB league ids (api-research.md §3.3 / §6.1) — static, only 2 competitions. */
export const COMP_TSDB_ID: Record<CompetitionId, string> = {
  laliga: COMPETITIONS.laliga.theSportsDb,
  ucl: COMPETITIONS.ucl.theSportsDb,
};

const COMP_LIST = Object.values(COMPETITIONS);

type TeamSourceIds = { footballData?: number | string; apiFootball?: number | string; theSportsDb?: string };

let byFootballData = new Map<number, TeamId>();
let byApiFootball = new Map<number, TeamId>();
let byTsdb = new Map<string, TeamId>();
let tsdbByTeam = new Map<TeamId, string>();

/** (Re)loads `teams.source_ids` for all 20 known slugs. Call at boot, and
 *  again on every `syncFixtures` run so a freshly resolved id (e.g. after
 *  `scripts/resolveTeamIds.ts` runs) is picked up without a restart. */
export async function refreshTeamCache(): Promise<void> {
  const { data, error } = await db.from('teams').select('id, source_ids');
  if (error) {
    console.warn('[ids] refreshTeamCache failed, keeping previous cache', error);
    return;
  }

  const nf = new Map<number, TeamId>();
  const na = new Map<number, TeamId>();
  const nt = new Map<string, TeamId>();
  const tt = new Map<TeamId, string>();

  for (const row of (data ?? []) as { id: string; source_ids: TeamSourceIds | null }[]) {
    if (!(row.id in TEAMS)) continue; // defensive: ignore rows outside the known 20 slugs
    const slug = row.id as TeamId;
    const sids = row.source_ids ?? {};
    if (sids.footballData != null) nf.set(Number(sids.footballData), slug);
    if (sids.apiFootball != null) na.set(Number(sids.apiFootball), slug);
    if (sids.theSportsDb) {
      nt.set(String(sids.theSportsDb), slug);
      tt.set(slug, String(sids.theSportsDb));
    }
  }

  byFootballData = nf;
  byApiFootball = na;
  byTsdb = nt;
  tsdbByTeam = tt;
}

const toNum = (v: number | string | null | undefined): number | null => {
  if (v == null || v === '') return null;
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
};

export function teamSlugByFootballDataId(id: number | string | null | undefined): TeamId | null {
  const n = toNum(id);
  return n == null ? null : (byFootballData.get(n) ?? null);
}

export function teamSlugByApiFootballId(id: number | string | null | undefined): TeamId | null {
  const n = toNum(id);
  return n == null ? null : (byApiFootball.get(n) ?? null);
}

export function teamSlugByTsdbId(id: string | null | undefined): TeamId | null {
  return id ? (byTsdb.get(id) ?? null) : null;
}

/** TheSportsDB team id for a slug, once resolved — null until then. */
export function tsdbIdForTeam(slug: TeamId): string | null {
  return tsdbByTeam.get(slug) ?? null;
}

export function compSlugByFootballDataCode(code: string | null | undefined): CompetitionId | null {
  if (!code) return null;
  return (COMP_LIST.find((c) => c.footballData === code)?.id as CompetitionId | undefined) ?? null;
}

export function compSlugByApiFootballId(id: number | string | null | undefined): CompetitionId | null {
  const n = toNum(id);
  return n == null ? null : (COMP_LIST.find((c) => c.apiFootball === n)?.id as CompetitionId | undefined) ?? null;
}

/** Any of the 20 seeded LaLiga slugs — every club is synced, not just 2. */
export function isTrackedSlug(slug: string | null | undefined): slug is TeamId {
  return slug != null && slug in TEAMS;
}

export function teamName(slug: string | null | undefined): string | null {
  return isTrackedSlug(slug) ? TEAMS[slug].name : null;
}

/** '2026-27' → '2026-2027' (TheSportsDB season-string format). */
export function tsdbSeason(season: string): string {
  const start = Number(season.split('-')[0]);
  return Number.isFinite(start) ? `${start}-${start + 1}` : season;
}
