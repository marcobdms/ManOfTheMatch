import { COMPETITIONS, CURRENT_SEASON } from '../lib/shared.js';
import type { CompetitionId } from '../lib/shared.js';
import { db } from '../db.js';
import { withRun } from '../lib/run.js';
import { getStandings } from '../sources/footballData.js';
import { teamSlugByFootballDataId } from '../lib/ids.js';

/**
 * Snapshot the LaLiga table and the Champions league-phase table into
 * `standings` (api-research.md §6.8). One insert per run — the `captured_at`
 * timestamp makes each run a fresh snapshot; the UI reads the latest.
 * For CL, football-data returns a single 36-row TOTAL table (group
 * "LEAGUE_STAGE"); all rows are stored and the UI slices the cut lines.
 */
export function syncStandings() {
  return withRun('syncStandings', 'football-data', async () => {
    let count = 0;

    for (const comp of Object.values(COMPETITIONS)) {
      const compId = comp.id as CompetitionId;
      let data;
      try {
        data = await getStandings(comp.footballData as 'PD' | 'CL');
      } catch (err) {
        console.error(`[syncStandings] ${comp.footballData} standings failed`, err);
        continue;
      }

      const capturedAt = new Date().toISOString();
      const rows = [];

      for (const block of data.standings ?? []) {
        if (block.type !== 'TOTAL') continue; // skip HOME / AWAY splits
        for (const r of block.table ?? []) {
          rows.push({
            competition_id: compId,
            season_id: CURRENT_SEASON,
            team_id: teamSlugByFootballDataId(r.team?.id),
            team_name: r.team?.name ?? 'Unknown',
            position: r.position,
            played: r.playedGames ?? null,
            won: r.won ?? null,
            draw: r.draw ?? null,
            lost: r.lost ?? null,
            goals_for: r.goalsFor ?? null,
            goals_against: r.goalsAgainst ?? null,
            goal_diff: r.goalDifference ?? null,
            points: r.points ?? null,
            form: r.form ?? null,
            source: 'footballData',
            captured_at: capturedAt,
          });
        }
      }

      if (rows.length) {
        const { error } = await db.from('standings').insert(rows);
        if (error) throw new Error(`standings insert (${compId}): ${error.message}`);
        count += rows.length;
      }
    }

    return count;
  });
}
