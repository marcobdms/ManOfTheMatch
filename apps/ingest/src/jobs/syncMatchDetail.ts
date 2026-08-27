import { db } from '../db.js';
import { withRun } from '../lib/run.js';
import {
  getFixtureEvents,
  getFixtureLineups,
  getFixturePlayers,
} from '../sources/apiFootball.js';
import type { AfEvent, AfLineup, AfPlayersTeam } from '../sources/apiFootball.js';
import { mapApiFootballEvent } from '../lib/map.js';
import { teamSlugByApiFootballId } from '../lib/ids.js';
import { API_FOOTBALL_DAILY_BUDGET, apiFootballHasBudget, apiFootballUsedToday } from '../lib/budget.js';

/**
 * Post-match enrichment from API-Football (api-research.md §3.2 / §6.5–§6.7):
 * full timeline → `match_events`, formations → `lineups`, ratings/stats →
 * `player_match_stats` (`rating` = `statistics[0].games.rating`).
 *
 * Budget: the free tier is 100 req/day. This only ever runs for a *tracked*
 * fixture that already carries an `apiFootball` id, and only:
 *   - `lineups` phase — once, ~20' after kickoff (confirmed XI)          → 1 req
 *   - `full` phase    — once FINISHED, plus one ratings-settle re-sweep  → 3 req
 * The number of API-Football requests consumed is returned and recorded in
 * `sync_runs.items` (source 'api-football') for daily-budget accounting.
 */

export type DetailPhase = 'lineups' | 'events' | 'full';
const PHASE_COST: Record<DetailPhase, number> = { lineups: 1, events: 1, full: 3 };

export function syncMatchDetail(
  fixtureId: string,
  apiFootballFixtureId: number,
  phase: DetailPhase = 'full',
) {
  return withRun('syncMatchDetail', 'api-football', async () => {
    const used = await apiFootballUsedToday();
    if (used + PHASE_COST[phase] > API_FOOTBALL_DAILY_BUDGET) {
      console.warn(
        `[syncMatchDetail] budget guard: ${used}/${API_FOOTBALL_DAILY_BUDGET} used today — skipping ${phase} for ${fixtureId}`,
      );
      return 0;
    }

    if (phase === 'lineups') {
      const lineups = await getFixtureLineups(apiFootballFixtureId);
      const n = await upsertLineups(fixtureId, lineups);
      console.log(`[syncMatchDetail] ${fixtureId} lineups: ${n} rows`);
      return PHASE_COST.lineups;
    }

    if (phase === 'events') {
      const events = await getFixtureEvents(apiFootballFixtureId);
      const n = await upsertEvents(fixtureId, apiFootballFixtureId, events);
      console.log(`[syncMatchDetail] ${fixtureId} events(live): ${n} rows`);
      return PHASE_COST.events;
    }

    const [events, lineups, players] = await Promise.all([
      getFixtureEvents(apiFootballFixtureId),
      getFixtureLineups(apiFootballFixtureId),
      getFixturePlayers(apiFootballFixtureId),
    ]);

    const nEvents = await upsertEvents(fixtureId, apiFootballFixtureId, events);
    const nLineups = await upsertLineups(fixtureId, lineups);
    const nStats = await upsertPlayerStats(fixtureId, players);

    const now = new Date().toISOString();
    await db.from('fixtures').update({ detail_synced_at: now, updated_at: now }).eq('id', fixtureId);

    console.log(
      `[syncMatchDetail] ${fixtureId} full: ${nEvents} events, ${nLineups} lineup rows, ${nStats} player stats`,
    );
    return PHASE_COST.full;
  });
}

// ---------------------------------------------------------------------------
// mappers (api-research.md §6.5 / §6.6 / §6.7)
// ---------------------------------------------------------------------------

async function upsertEvents(
  fixtureId: string,
  afFixtureId: number,
  events: AfEvent[],
): Promise<number> {
  const rows = events
    .map((e, i) => {
      const type = mapApiFootballEvent(e.type, e.detail);
      if (!type) return null;
      const elapsed = e.time?.elapsed ?? null;
      const extra = e.time?.extra ?? null;
      const pid = e.player?.id != null ? String(e.player.id) : null;
      // No native event id → deterministic hash per §6.5.
      const sourceEventId = `${afFixtureId}:${elapsed ?? 'x'}:${extra ?? 0}:${e.type}:${pid ?? e.player?.name ?? i}`;
      return {
        fixture_id: fixtureId,
        type,
        minute: elapsed,
        minute_extra: extra,
        team_id: teamSlugByApiFootballId(e.team?.id),
        player_name: e.player?.name ?? null,
        player_id: pid,
        assist_name: e.assist?.name ?? null,
        detail: e.detail ?? null,
        sort_key: i,
        source: 'apiFootball',
        source_event_id: sourceEventId,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (rows.length) {
    await db
      .from('match_events')
      .upsert(rows, { onConflict: 'fixture_id,source,source_event_id', ignoreDuplicates: true });
  }
  return rows.length;
}

async function upsertLineups(fixtureId: string, lineups: AfLineup[]): Promise<number> {
  const rows = [];
  for (const block of lineups) {
    // `lineups.team_id` is NOT NULL FK → only the tracked team is storable.
    const teamId = teamSlugByApiFootballId(block.team?.id);
    if (!teamId) continue;
    const coach = block.coach?.name ?? null;
    const formation = block.formation ?? null;

    for (const s of block.startXI ?? []) {
      rows.push(lineupRow(fixtureId, teamId, formation, coach, s, true));
    }
    for (const s of block.substitutes ?? []) {
      rows.push(lineupRow(fixtureId, teamId, formation, coach, s, false));
    }
  }

  if (rows.length) {
    await db
      .from('lineups')
      .upsert(rows, { onConflict: 'fixture_id,team_id,player_name,is_starting' });
  }
  return rows.length;
}

function lineupRow(
  fixtureId: string,
  teamId: string,
  formation: string | null,
  coach: string | null,
  s: AfLineup['startXI'][number],
  isStarting: boolean,
) {
  const p = s.player;
  return {
    fixture_id: fixtureId,
    team_id: teamId,
    formation,
    is_starting: isStarting,
    player_id: p?.id != null ? String(p.id) : null,
    player_name: p?.name ?? 'Unknown',
    shirt_number: p?.number ?? null,
    position: p?.pos ?? null,
    grid: isStarting ? p?.grid ?? null : null,
    source: 'apiFootball',
    coach, // 0002 column
  };
}

async function upsertPlayerStats(fixtureId: string, teams: AfPlayersTeam[]): Promise<number> {
  const rows = [];
  for (const block of teams) {
    // `player_match_stats.team_id` is NOT NULL FK → only the tracked team.
    const teamId = teamSlugByApiFootballId(block.team?.id);
    if (!teamId) continue;

    for (const entry of block.players ?? []) {
      const st = entry.statistics?.[0];
      if (!st) continue;

      const rating = num(st.games?.rating);
      const acc = int(st.passes?.accuracy);

      rows.push({
        fixture_id: fixtureId,
        team_id: teamId,
        player_id: entry.player?.id != null ? String(entry.player.id) : null,
        player_name: entry.player?.name ?? 'Unknown',
        minutes: st.games?.minutes ?? null,
        rating,
        goals: st.goals?.total ?? 0,
        assists: st.goals?.assists ?? 0,
        shots: st.shots?.total ?? 0,
        shots_on: st.shots?.on ?? 0,
        passes: st.passes?.total ?? 0,
        pass_accuracy: acc,
        key_passes: st.passes?.key ?? 0,
        tackles: st.tackles?.total ?? 0,
        duels_won: st.duels?.won ?? 0,
        dribbles: st.dribbles?.success ?? 0,
        touches: null, // not in API-Football
        xg: null, // team-level only in API-Football → left for Understat/Fotmob
        xa: null,
        yellow: st.cards?.yellow ?? 0,
        red: st.cards?.red ?? 0,
        source: 'apiFootball',
        raw: st,
      });
    }
  }

  if (rows.length) {
    await db
      .from('player_match_stats')
      .upsert(rows, { onConflict: 'fixture_id,player_name,source' });
  }
  return rows.length;
}

const num = (v: string | null | undefined): number | null => {
  if (v == null || v === '') return null;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

const int = (v: string | null | undefined): number | null => {
  if (v == null || v === '') return null;
  const n = Number.parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
};

// ---------------------------------------------------------------------------
// trigger — scanned from index.ts every 5 min
// ---------------------------------------------------------------------------

type DueRow = {
  id: string;
  source_ids: Record<string, string | number> | null;
  status: string;
  kickoff_at: string;
  detail_synced_at: string | null;
};

/**
 * Dispatch `syncMatchDetail` for every fixture that is due:
 *   - LIVE/PAUSED, ≥20' past kickoff, no API-Football lineups yet  → 'lineups'
 *   - FINISHED, never enriched                                     → 'full'
 *   - FINISHED, enriched >2 h ago and <5 h past kickoff            → 'full' (ratings re-sweep, once)
 */
export function runDueMatchDetails() {
  return withRun('matchDetailSweep', 'internal', async () => {
    // Cheapest possible bail-out on a spent day (guard is also re-checked per dispatch).
    if (!(await apiFootballHasBudget(1))) {
      console.warn('[matchDetailSweep] API-Football daily budget spent — skipping sweep');
      return 0;
    }

    const { data: rows } = await db
      .from('fixtures')
      .select('id, source_ids, status, kickoff_at, detail_synced_at');

    const nowMs = Date.now();
    let dispatched = 0;

    for (const f of (rows ?? []) as DueRow[]) {
      const afRaw = (f.source_ids ?? {}).apiFootball;
      if (afRaw == null) continue;
      const afId = Number(afRaw);
      if (!Number.isFinite(afId)) continue;

      const kickoffMs = new Date(f.kickoff_at).getTime();

      if ((f.status === 'LIVE' || f.status === 'PAUSED') && nowMs >= kickoffMs + 15 * 60_000) {
        // Richer live timeline from API-Football (player + assist names). The
        // adapter TTL throttles the real fetch; each dispatch costs 1 budget unit.
        await syncMatchDetail(f.id, afId, 'events');
        dispatched++;

        const { count } = await db
          .from('lineups')
          .select('id', { count: 'exact', head: true })
          .eq('fixture_id', f.id)
          .eq('source', 'apiFootball');
        if (!count) await syncMatchDetail(f.id, afId, 'lineups');
        continue;
      }

      if (f.status === 'FINISHED') {
        const last = f.detail_synced_at ? new Date(f.detail_synced_at).getTime() : null;
        const firstTime = last == null;
        const reSweep =
          last != null && nowMs - last > 2 * 3_600_000 && nowMs < kickoffMs + 5 * 3_600_000;
        if (firstTime || reSweep) {
          await syncMatchDetail(f.id, afId, 'full');
          dispatched++;
        }
      }
    }

    return dispatched;
  });
}
