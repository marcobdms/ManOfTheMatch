/**
 * Dispara syncLineups() una sola vez y termina — para probar en local que las
 * fotos resueltas por resolvePlayerPhotos.ts ya llegan a
 * team_lineup_snapshots, sin encender el resto del worker (bootstrap.ts trae
 * el ticker de ESPN cada 2s, notificaciones push, etc. — eso sí compite con
 * el proceso que corre en Coolify).
 *
 *   npm run sync-lineups-once
 */
import { refreshTeamCache } from '../lib/ids.js';
import { syncLineups } from '../jobs/syncLineups.js';

await refreshTeamCache();
await syncLineups();
console.log('syncLineups: listo (ver conteo en la tabla sync_runs)');
