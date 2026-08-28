import { db } from '../db.js';

/**
 * API-Football free tier is 100 requests/day, resetting at 00:00 UTC
 * (api-research.md §3.2). We cap our own spend safely below that.
 *
 * `syncMatchDetail` records the number of API-Football HTTP requests each run
 * consumed in `sync_runs.items` (with `source = 'api-football'`). `usedToday`
 * sums today's rows so a caller can check whether the next sweep still fits.
 * Counting is deliberately by *attempt*, not by cache-miss — over-counting is
 * safe, under-counting risks a 429. A run that errored out never got to write
 * `items`, so it is charged a conservative `FAILED_RUN_COST` (a persistent
 * failure — e.g. the §8 season-lock — then trips the guard instead of hammering
 * the real 100/day quota all afternoon).
 */
export const API_FOOTBALL_DAILY_BUDGET = 75;
const FAILED_RUN_COST = 3;

export async function apiFootballUsedToday(): Promise<number> {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const { data } = await db
    .from('sync_runs')
    .select('items, ok')
    .eq('source', 'api-football')
    .gte('started_at', start.toISOString());
  return (data ?? []).reduce((sum: number, r: { items: number | null; ok: boolean | null }) => {
    if (r.items != null) return sum + r.items;
    return sum + (r.ok === false ? FAILED_RUN_COST : 0);
  }, 0);
}

/** True if `cost` more API-Football requests would still fit today's budget. */
export async function apiFootballHasBudget(cost: number): Promise<boolean> {
  const used = await apiFootballUsedToday();
  return used + cost <= API_FOOTBALL_DAILY_BUDGET;
}
