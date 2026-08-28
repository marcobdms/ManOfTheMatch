import { Cron } from 'croner';
import { POLL } from './lib/shared.js';
import { refreshTeamCache } from './lib/ids.js';
import { syncFixtures } from './jobs/syncFixtures.js';
import { syncStandings } from './jobs/syncStandings.js';
import { liveLoop } from './jobs/liveLoop.js';
import { runDueMatchDetails } from './jobs/syncMatchDetail.js';

console.log('[ingest] worker ManOfTheMatch arrancando…');

// Populate the teams.source_ids cache before any job can run — syncFixtures
// (below) refreshes it again on every run, so a later resolveTeamIds.ts pass
// is picked up without restarting the worker.
await refreshTeamCache();

// Calendar + standings: twice a day.
new Cron(POLL.idleCron, guard(syncFixtures));
new Cron('30 6,18 * * *', guard(syncStandings));

// Live loop: every minute (POLL.liveSeconds), cheap when nothing is in play.
new Cron('* * * * *', guard(liveLoop));

// API-Football post-match / confirmed-lineup enrichment. Cheap scan every 5 min;
// each dispatch is budget-guarded (100 req/day free tier).
new Cron('*/5 * * * *', guard(runDueMatchDetails));

// Kick one calendar sync on boot so a fresh deploy isn't empty.
guard(syncFixtures)();

function guard(fn: () => Promise<unknown>) {
  return () => {
    fn().catch((err) => console.error('[ingest] job error', err));
  };
}

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    console.log(`[ingest] ${sig} — saliendo`);
    process.exit(0);
  });
}
