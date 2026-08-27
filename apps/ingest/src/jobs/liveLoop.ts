import { db } from '../db.js';
import { withRun } from '../lib/run.js';
import { getMatch } from '../sources/footballData.js';
import { getLivescores, getTimeline } from '../sources/theSportsDB.js';
import type { TsdbLiveEvent } from '../sources/theSportsDB.js';
import { pushGoal } from '../notify.js';
import { GOAL_EVENT_TYPES, mapFootballDataStatus, mapTheSportsDbEvent, mapTheSportsDbStatus } from '../lib/map.js';
import { isTrackedSlug, teamName, teamSlugByTsdbId } from '../lib/ids.js';

/**
 * Runs every minute (POLL.liveSeconds). For every tracked fixture that is LIVE /
 * PAUSED, or whose kickoff is within ±2 h, refresh score / minute / status from
 * football-data.org (fallback: TheSportsDB `livescore.php`), diff `match_events`
 * from the TheSportsDB timeline, and fire a GOAL push when the tracked fixture's
 * score goes up (api-research.md §6.4 / §6.5 / §2).
 *
 * The per-minute cron is cheap on idle minutes (one indexed select → return).
 * Real API cadence is shaped by the cache TTLs (getMatch ~90 s, livescore ~50 s,
 * timeline ~150 s) per the polling plan §4.2.
 */

const WINDOW_MS = 2 * 60 * 60 * 1000;
const SKIP_STATUSES = new Set(['FINISHED', 'POSTPONED', 'SUSPENDED']);

type FixtureRow = {
  id: string;
  source_ids: Record<string, string | number> | null;
  status: string;
  kickoff_at: string;
  home_team_id: string | null;
  away_team_id: string | null;
  home_team_name: string | null;
  away_team_name: string | null;
  home_score: number | null;
  away_score: number | null;
  last_synced_at: string | null;
};

const SELECT =
  'id, source_ids, status, kickoff_at, home_team_id, away_team_id, home_team_name, away_team_name, home_score, away_score, last_synced_at';

export function liveLoop() {
  return withRun('liveLoop', 'football-data', async () => {
    const nowMs = Date.now();
    const lo = new Date(nowMs - WINDOW_MS).toISOString();
    const hi = new Date(nowMs + WINDOW_MS).toISOString();

    const [{ data: playing }, { data: soon }] = await Promise.all([
      db.from('fixtures').select(SELECT).in('status', ['LIVE', 'PAUSED']),
      db.from('fixtures').select(SELECT).gte('kickoff_at', lo).lte('kickoff_at', hi),
    ]);

    const byId = new Map<string, FixtureRow>();
    for (const f of (playing ?? []) as FixtureRow[]) byId.set(f.id, f);
    for (const f of (soon ?? []) as FixtureRow[]) {
      if (!SKIP_STATUSES.has(f.status)) byId.set(f.id, f);
    }
    const active = [...byId.values()];
    if (active.length === 0) return 0;

    let livescore: TsdbLiveEvent[] = [];
    try {
      const ls = await getLivescores();
      livescore = ls.livescore ?? ls.events ?? [];
    } catch (err) {
      console.warn('[liveLoop] livescore fetch failed', err);
    }

    let touched = 0;
    for (const f of active) {
      try {
        await syncOne(f, livescore);
        touched++;
      } catch (err) {
        console.error(`[liveLoop] fixture ${f.id} failed`, err);
      }
    }
    return touched;
  });
}

async function syncOne(f: FixtureRow, livescore: TsdbLiveEvent[]): Promise<void> {
  const sids = f.source_ids ?? {};
  const fdId = sids.footballData;
  const tsdbId = sids.theSportsDb != null ? String(sids.theSportsDb) : null;

  let status = f.status;
  let minute: number | null = null;
  let home: number | null = f.home_score;
  let away: number | null = f.away_score;
  let htHome: number | null = null;
  let htAway: number | null = null;
  let gotHt = false;

  // 1) football-data.org single match — primary (delayed, but authoritative).
  if (fdId != null) {
    try {
      const m = await getMatch(fdId);
      status = mapFootballDataStatus(m.status);
      if (typeof m.minute === 'number') minute = m.minute;
      home = m.score?.fullTime?.home ?? home;
      away = m.score?.fullTime?.away ?? away;
      if (m.score?.halfTime) {
        htHome = m.score.halfTime.home;
        htAway = m.score.halfTime.away;
        gotHt = true;
      }
    } catch (err) {
      console.warn(`[liveLoop] getMatch failed for ${f.id}`, err);
    }
  }

  // 2) TheSportsDB livescore — fill gaps only (minute, and score if fd has none).
  const ls = tsdbId ? livescore.find((x) => x.idEvent === tsdbId) : undefined;
  if (ls) {
    const lsStatus = mapTheSportsDbStatus(ls.strStatus);
    if (status === 'SCHEDULED' && (lsStatus === 'LIVE' || lsStatus === 'PAUSED')) status = lsStatus;
    if (minute == null) {
      const p = Number.parseInt(ls.strProgress ?? '', 10);
      if (Number.isFinite(p)) minute = p;
    }
    if (home == null && ls.intHomeScore != null && ls.intHomeScore !== '') home = Number(ls.intHomeScore);
    if (away == null && ls.intAwayScore != null && ls.intAwayScore !== '') away = Number(ls.intAwayScore);
  }

  // 3) Timeline → diff match_events (source = theSportsDb).
  const freshGoals: { home: boolean; minute: number | null; player: string | null }[] = [];
  if (tsdbId) {
    try {
      const timeline = (await getTimeline(tsdbId)).timeline ?? [];
      if (timeline.length) {
        const { data: existing } = await db
          .from('match_events')
          .select('source_event_id')
          .eq('fixture_id', f.id)
          .eq('source', 'theSportsDb');
        const seen = new Set((existing ?? []).map((r: { source_event_id: string }) => r.source_event_id));

        const toInsert = [];
        for (const it of timeline) {
          const type = mapTheSportsDbEvent(it.strTimeline, it.strTimelineDetail);
          if (!type) continue;
          const seid = it.idTimeline || `${it.intTime}:${it.strTimeline}:${it.strPlayer ?? ''}`;
          if (seen.has(seid)) continue;

          const isHome = (it.strHome ?? '').toLowerCase() === 'yes';
          const mnt = Number.parseInt(it.intTime ?? '', 10);
          const minuteVal = Number.isFinite(mnt) ? mnt : null;

          toInsert.push({
            fixture_id: f.id,
            type,
            minute: minuteVal,
            minute_extra: null,
            team_id: teamSlugByTsdbId(it.idTeam) ?? (isHome ? f.home_team_id : f.away_team_id),
            player_name: it.strPlayer || null,
            player_id: it.idPlayer || null,
            assist_name: it.strAssist && it.strAssist !== '0' ? it.strAssist : null,
            detail: it.strTimelineDetail || it.strComment || null,
            sort_key: Number.isFinite(Number(seid)) ? Number(seid) : minuteVal ?? 0,
            source: 'theSportsDb',
            source_event_id: seid,
          });

          if (GOAL_EVENT_TYPES.has(type)) {
            // Own goal counts for the *other* side.
            freshGoals.push({ home: type === 'OWN_GOAL' ? !isHome : isHome, minute: minuteVal, player: it.strPlayer || null });
          }
        }

        if (toInsert.length) {
          await db
            .from('match_events')
            .upsert(toInsert, { onConflict: 'fixture_id,source,source_event_id', ignoreDuplicates: true });
        }
      }
    } catch (err) {
      console.warn(`[liveLoop] timeline failed for ${f.id}`, err);
    }
  }

  // 4) Persist score / status. Only write HT once a source actually reported it,
  //    so a transient fetch failure never blanks a known half-time score.
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status,
    minute,
    home_score: home,
    away_score: away,
    last_synced_at: now,
    updated_at: now,
  };
  if (gotHt) {
    patch.home_score_ht = htHome;
    patch.away_score_ht = htAway;
  }
  await db.from('fixtures').update(patch).eq('id', f.id);

  // 5) GOAL notifications — only once we've seen this fixture before (avoids a
  //    burst of stale pushes on worker restart) and only when the score rose.
  if (f.last_synced_at != null) {
    await maybePushGoals(f, home, away, freshGoals);
  }
}

async function maybePushGoals(
  f: FixtureRow,
  newHome: number | null,
  newAway: number | null,
  freshGoals: { home: boolean; minute: number | null; player: string | null }[],
): Promise<void> {
  const prevHome = f.home_score ?? 0;
  const prevAway = f.away_score ?? 0;
  const dHome = (newHome ?? prevHome) - prevHome;
  const dAway = (newAway ?? prevAway) - prevAway;
  if (dHome <= 0 && dAway <= 0) return;

  const trackedSide: 'home' | 'away' | null = isTrackedSlug(f.home_team_id)
    ? 'home'
    : isTrackedSlug(f.away_team_id)
      ? 'away'
      : null;
  if (!trackedSide) return;

  const trackedTeamId = (trackedSide === 'home' ? f.home_team_id : f.away_team_id) as string;
  const score = `${newHome ?? '?'}-${newAway ?? '?'}`;

  const fire = async (side: 'home' | 'away') => {
    const forUs = side === trackedSide;
    const scoringName =
      teamName(side === 'home' ? f.home_team_id : f.away_team_id) ??
      (side === 'home' ? f.home_team_name : f.away_team_name);
    const scorer = freshGoals.find((g) => g.home === (side === 'home'))?.player ?? null;
    const title = forUs
      ? `Gol del ${scoringName ?? 'equipo'}`
      : `Gol del rival${scoringName ? ` (${scoringName})` : ''}`;
    const body = [scorer, score].filter(Boolean).join(' · ');
    await pushGoal({ fixtureId: f.id, teamId: trackedTeamId, title, body });
  };

  if (dHome > 0) await fire('home');
  if (dAway > 0) await fire('away');
}
