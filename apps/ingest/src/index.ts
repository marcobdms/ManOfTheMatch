// Load apps/ingest/.env for local dev — tsx does NOT auto-load it. In prod
// (Coolify) there is no file; env vars are injected and this block no-ops.
import { readFileSync } from 'node:fs';
try {
  const raw = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const [, key, val] = m;
    if (key && process.env[key] === undefined) {
      process.env[key] = (val ?? '').replace(/^(['"])(.*)\1$/, '$2');
    }
  }
} catch {
  // no .env file — rely on the real environment
}

// Guard BEFORE importing anything Supabase-bound (db.ts throws at load without keys).
const missing = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].filter((k) => !process.env[k]);
if (missing.length) {
  console.log(
    `[ingest] en espera — falta apps/ingest/.env (${missing.join(', ')}).\n` +
      '[ingest] copia apps/ingest/.env.example a apps/ingest/.env y reinicia. El front no se ve afectado.',
  );
  process.exit(0);
}

await import('./bootstrap.js');
