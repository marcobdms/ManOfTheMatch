import { Cron } from 'croner';
import { POLL } from './lib/shared.js';
import { refreshTeamCache } from './lib/ids.js';
import { syncFixtures } from './jobs/syncFixtures.js';
import { syncStandings } from './jobs/syncStandings.js';
import { liveLoop } from './jobs/liveLoop.js';
import { liveTicker } from './jobs/liveTicker.js';
import { liveTickerEspnTick } from './jobs/liveTickerEspn.js';
import { syncMatchFacts } from './jobs/syncMatchFacts.js';
import { runDueMatchDetails } from './jobs/syncMatchDetail.js';
import { syncLineups } from './jobs/syncLineups.js';
import { syncPredictions } from './jobs/syncPredictions.js';

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

// Marcador + goles/tarjetas con la mínima latencia posible: ESPN cada 2s.
// Su CDN sirve `max-age=1`, así que sondear rápido SÍ aporta aquí (a
// diferencia de Fotmob, ver abajo). El job consulta primero si hay algún
// fixture LIVE/PAUSED; si no hay, no toca la red.
new Cron('*/2 * * * * *', { protect: true }, guard(liveTickerEspnTick));

// Histórico y stats de Fotmob: cada 60s, no más rápido. Su `matchDetails`
// viene con `cache-control: max-age=300` (5 min) y llega con `age` de hasta
// ~100s, así que pedirlo cada 10s gastaba peticiones sin traer nada nuevo.
// Los goles urgentes ya los cubre ESPN arriba.
new Cron('* * * * *', { protect: true }, guard(liveTicker));
new Cron('* * * * *', { protect: true }, guard(syncMatchFacts));

// API-Football post-match / confirmed-lineup enrichment. Cheap scan every 5 min;
// each dispatch is budget-guarded (100 req/day free tier).
new Cron('*/5 * * * *', guard(runDueMatchDetails));

// Alineaciones Fotmob (posiciones x/y reales) cada 30 min. `sources/fotmob.ts`
// ya serializa + throttlea + circuit-breakea cada petición real a nivel de
// módulo (cola de un solo carril, ≥3s entre fetches), así que el "nunca en
// paralelo a Fotmob" queda garantizado ahí pase lo que pase aquí arriba.
// `protect: true` además evita que Croner solape dos pasadas del propio job
// si una tardase más de 30 min (p.ej. con el circuit breaker abierto).
new Cron('*/30 * * * *', { protect: true }, guard(syncLineups));

// Previsiones (cuotas + pronostico): cada 30 min, presupuesto propio y
// ventana de 36h se encargan de que sean pocas llamadas reales al dia.
new Cron('*/30 * * * *', { protect: true }, guard(syncPredictions));

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
