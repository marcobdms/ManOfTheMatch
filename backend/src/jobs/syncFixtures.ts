import { COMPETITIONS, CURRENT_SEASON, TEAMS } from '../lib/shared.js';
import type { CompetitionId, TeamId } from '../lib/shared.js';
import { db } from '../db.js';
import { withRun } from '../lib/run.js';
import { getCompetitionMatches } from '../sources/footballData.js';
import type { FootballDataMatch } from '../sources/footballData.js';
import { getEventsNext } from '../sources/theSportsDB.js';
import { mapFootballDataStatus } from '../lib/map.js';
import { refreshTeamCache, teamSlugByFootballDataId, teamSlugByTsdbId, tsdbIdForTeam } from '../lib/ids.js';

/**
 * Pull the LaLiga + Champions calendars from football-data.org and upsert
 * every fixture into `fixtures` (api-research.md §6.4) — all 20 LaLiga clubs,
 * not just 2. Runs twice a day (POLL.idleCron).
 *
 * football-data.org is the only fixture writer; rows are keyed on
 * `source_ids.footballData` so a reschedule updates in place instead of
 * duplicating. Fixtures whose side(s) aren't a seeded LaLiga slug (e.g. a
 * Champions League opponent) still get stored via the `home_team_name` /
 * `home_team_crest` text columns (`0002`) — no `teams` row required. A
 * best-effort second pass then folds in the TheSportsDB `idEvent` and — for
 * free — the API-Football `idAPIfootball` that `syncMatchDetail` needs.
 */
export function syncFixtures() {
  return withRun('syncFixtures', 'football-data', async () => {
    await refreshTeamCache();
    let count = 0;

    for (const comp of Object.values(COMPETITIONS)) {
      const compId = comp.id as CompetitionId;
      let data;
      try {
        data = await getCompetitionMatches(comp.footballData as 'PD' | 'CL');
      } catch (err) {
        console.error(`[syncFixtures] ${comp.footballData} matches failed`, err);
        continue;
      }

      for (const m of data.matches ?? []) {
        const home = teamSlugByFootballDataId(m.homeTeam?.id);
        const away = teamSlugByFootballDataId(m.awayTeam?.id);

        try {
          await upsertFixture(compId, home, away, m);
          count++;
        } catch (err) {
          console.error(`[syncFixtures] upsert failed for fd match ${m.id}`, err);
        }
      }
    }

    let xref = 0;
    try {
      xref = await crossReferenceIds();
    } catch (err) {
      console.warn('[syncFixtures] TheSportsDB id cross-ref failed', err);
    }
    console.log(`[syncFixtures] upserted ${count} fixtures, cross-referenced ${xref} ids`);

    return count;
  });
}

async function upsertFixture(
  compId: CompetitionId,
  home: TeamId | null,
  away: TeamId | null,
  m: FootballDataMatch,
): Promise<void> {
  const now = new Date().toISOString();
  const row = {
    competition_id: compId,
    season_id: CURRENT_SEASON,
    matchday: m.matchday ?? null,
    stage: [m.stage, m.group].filter(Boolean).join(' / ') || null,
    home_team_id: home,
    away_team_id: away,
    // 0002 columns — keep opponent identity inline (only tracked teams get a slug).
    home_team_name: m.homeTeam?.name ?? null,
    away_team_name: m.awayTeam?.name ?? null,
    home_team_crest: m.homeTeam?.crest ?? null,
    away_team_crest: m.awayTeam?.crest ?? null,
    kickoff_at: m.utcDate,
    venue: m.venue ?? null,
    status: mapFootballDataStatus(m.status),
    home_score: m.score?.fullTime?.home ?? null,
    away_score: m.score?.fullTime?.away ?? null,
    home_score_ht: m.score?.halfTime?.home ?? null,
    away_score_ht: m.score?.halfTime?.away ?? null,
    last_synced_at: now,
    updated_at: now,
  };

  const { data: found } = await db
    .from('fixtures')
    .select('id, source_ids, status')
    .filter('source_ids->>footballData', 'eq', String(m.id))
    .limit(1);
  const existing = (found ?? [])[0] as
    | { id: string; source_ids: Record<string, unknown> | null; status: string }
    | undefined;

  if (existing?.id) {
    // Este job corre a las 06:00 y 18:00 UTC con datos de football-data
    // cacheados hasta 1 h — justo cuando puede haber partido en juego. Si el
    // fixture está en vivo, NO se tocan marcador/estado/minuto: eso es
    // territorio de liveLoop/liveTicker, que van con fuentes frescas. Pisarlo
    // aquí revive el bug de "el gol no sube al marcador".
    const isLive = existing.status === 'LIVE' || existing.status === 'PAUSED';
    // Un partido ya terminado no puede "volver" a estar por jugarse. El feed
    // por partido de football-data se congela a veces (Celta-Athletic del
    // 30/08 se quedó en TIMED para siempre) y sin esto este job revertía a
    // SCHEDULED un fixture que liveLoop ya había cerrado, borrándole el
    // marcador y devolviéndolo a "Próximos" un día después de jugarse.
    const wouldUnfinish = existing.status === 'FINISHED' && row.status !== 'FINISHED';
    const patch = { ...row, source_ids: { ...(existing.source_ids ?? {}), footballData: m.id } };
    if (isLive || wouldUnfinish) {
      delete (patch as Partial<typeof row>).status;
      delete (patch as Partial<typeof row>).home_score;
      delete (patch as Partial<typeof row>).away_score;
      delete (patch as Partial<typeof row>).home_score_ht;
      delete (patch as Partial<typeof row>).away_score_ht;
    }
    await db.from('fixtures').update(patch).eq('id', existing.id);
  } else {
    await db.from('fixtures').insert({ ...row, source_ids: { footballData: m.id } });
  }
}

/**
 * For each tracked team, read TheSportsDB `eventsnext` and stamp the matching
 * `fixtures` row with `source_ids.theSportsDb` (+ `.apiFootball` when present).
 * Matches on kickoff date + the tracked team being on the expected side.
 */
async function crossReferenceIds(): Promise<number> {
  let patched = 0;

  for (const team of Object.values(TEAMS)) {
    const slug = team.id as TeamId;
    const tsdbId = tsdbIdForTeam(slug);
    if (!tsdbId) continue; // not yet resolved (scripts/resolveTeamIds.ts hasn't run for this club)

    let events;
    try {
      events = (await getEventsNext(tsdbId)).events ?? [];
    } catch (err) {
      console.warn(`[syncFixtures] eventsnext failed for ${slug}`, err);
      continue;
    }

    for (const ev of events) {
      const day = ev.dateEvent;
      if (!day || !ev.idEvent) continue;

      const homeSlug = teamSlugByTsdbId(ev.idHomeTeam);
      const awaySlug = teamSlugByTsdbId(ev.idAwayTeam);

      // Candidates on that UTC calendar day, then pinned by kickoff proximity
      // (±6 h) when TheSportsDB gives a timestamp — LaLiga/UCL kickoffs sit at
      // ~16:00–21:00 UTC so the day boundary is safe in practice.
      const { data: near } = await db
        .from('fixtures')
        .select('id, source_ids, home_team_id, away_team_id, kickoff_at')
        .gte('kickoff_at', `${day}T00:00:00Z`)
        .lte('kickoff_at', `${day}T23:59:59Z`)
        .order('kickoff_at', { ascending: true });

      const stamp = ev.strTimestamp ? Date.parse(`${ev.strTimestamp.replace(' ', 'T')}Z`) : NaN;
      const match = (
        (near ?? []) as {
          id: string;
          source_ids: Record<string, unknown> | null;
          home_team_id: string | null;
          away_team_id: string | null;
          kickoff_at: string;
        }[]
      ).find((c) => {
        const sideOk =
          homeSlug && awaySlug
            ? c.home_team_id === homeSlug && c.away_team_id === awaySlug
            : homeSlug
              ? c.home_team_id === homeSlug
              : awaySlug
                ? c.away_team_id === awaySlug
                : false;
        if (!sideOk) return false;
        if (!Number.isFinite(stamp)) return true;
        return Math.abs(Date.parse(c.kickoff_at) - stamp) <= 6 * 3_600_000;
      });
      if (!match) continue;

      const before = match.source_ids ?? {};
      const merged: Record<string, string | number> = { ...before, theSportsDb: ev.idEvent };
      if (ev.idAPIfootball && ev.idAPIfootball !== '0') {
        merged.apiFootball = Number(ev.idAPIfootball);
      }
      if (JSON.stringify(merged) === JSON.stringify(before)) continue;

      await db
        .from('fixtures')
        .update({ source_ids: merged, updated_at: new Date().toISOString() })
        .eq('id', match.id);
      patched++;
    }
  }

  return patched;
}
