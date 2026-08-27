import { db } from '../db.js';

/** Bookkeeping around a sync job so failures are visible in the sync_runs table. */
export async function withRun(
  job: string,
  source: string,
  fn: () => Promise<number>,
): Promise<void> {
  const { data } = await db
    .from('sync_runs')
    .insert({ job, source })
    .select('id')
    .single();
  const id = data?.id as string | undefined;

  try {
    const items = await fn();
    if (id) await db.from('sync_runs').update({ finished_at: new Date().toISOString(), ok: true, items }).eq('id', id);
    console.log(`[ingest] ${job} ok (${items})`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (id) await db.from('sync_runs').update({ finished_at: new Date().toISOString(), ok: false, error: message }).eq('id', id);
    console.error(`[ingest] ${job} FAILED: ${message}`);
    throw err;
  }
}
