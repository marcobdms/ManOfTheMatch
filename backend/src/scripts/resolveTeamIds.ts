// One-off script: resolve the external ids (footballData / apiFootball /
// theSportsDb) for every seeded `teams` row and merge them into
// `teams.source_ids`. Run manually, once, after backend is deployed with
// real API keys (Coolify) — see docs/handoff-schema-notify.md §2.
//
//   npm run -w @motm/ingest resolve-ids
//
// Never guesses: a team it can't match with confidence is printed under
// "SIN RESOLVER" instead of silently getting a wrong id. Fix those by hand:
//   update teams set source_ids = source_ids || '{"footballData": 90}'::jsonb
//   where id = 'some-slug';
// then re-run this script (or just restart the worker — syncFixtures
// refreshes the id cache from the DB on every run).

import { readFileSync } from 'node:fs';
try {
  const raw = readFileSync(new URL('../../.env', import.meta.url), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const [, key, val] = m;
    if (key && process.env[key] === undefined) {
      process.env[key] = (val ?? '').replace(/^(['"])(.*)\1$/, '$2');
    }
  }
} catch {
  // no .env — rely on the real environment (Coolify)
}

const missing = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`[resolveTeamIds] faltan ${missing.join(', ')} — copia backend/.env.example a .env`);
  process.exit(1);
}

const { COMPETITIONS } = await import('../lib/shared.js');
const { db } = await import('../db.js');
const { getCompetitionTeams } = await import('../sources/footballData.js');
const { getLeagueTeams } = await import('../sources/apiFootball.js');
const { getAllTeamsInLeague } = await import('../sources/theSportsDB.js');

const DIACRITICS = /[\u0300-\u036f]/g;

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(DIACRITICS, '') // strip accents (combining diacritical marks)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function matches(a: string, b: string): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

type TeamRow = { id: string; name: string; short_name: string; tla: string; source_ids: Record<string, unknown> | null };

async function main() {
  const { data: teams, error } = await db.from('teams').select('id, name, short_name, tla, source_ids');
  if (error || !teams) throw error ?? new Error('no teams rows');

  const resolved: Record<string, { footballData?: number; apiFootball?: number; theSportsDb?: string }> = {};
  const unresolved: Record<string, string[]> = {};

  // --- football-data.org --------------------------------------------------
  try {
    const fd = await getCompetitionTeams('PD', 2026);
    for (const t of teams as TeamRow[]) {
      const hit = fd.teams.find((x) => matches(x.name, t.name) || (x.tla && matches(x.tla, t.tla)));
      if (hit) (resolved[t.id] ??= {}).footballData = hit.id;
    }
  } catch (err) {
    console.warn('[resolveTeamIds] football-data.org teams fetch failed', err);
  }

  // --- API-Football --------------------------------------------------------
  try {
    // Team ids are stable across seasons; 2024 is the newest the free plan allows.
    const af = await getLeagueTeams(COMPETITIONS.laliga.apiFootball, 2024);
    for (const t of teams as TeamRow[]) {
      const hit = af.find((x) => matches(x.team.name, t.name));
      if (hit) (resolved[t.id] ??= {}).apiFootball = hit.team.id;
    }
  } catch (err) {
    console.warn('[resolveTeamIds] API-Football teams fetch failed (free plan may reject season 2026 — see docs/endpoint-check-2026-08-27.md)', err);
  }

  // --- TheSportsDB -----------------------------------------------------
  try {
    const tsdb = await getAllTeamsInLeague(COMPETITIONS.laliga.theSportsDb);
    for (const t of teams as TeamRow[]) {
      const hit = (tsdb.teams ?? []).find(
        (x) => matches(x.strTeam, t.name) || (x.strTeamShort && matches(x.strTeamShort, t.short_name)),
      );
      if (hit) (resolved[t.id] ??= {}).theSportsDb = hit.idTeam;
    }
  } catch (err) {
    console.warn('[resolveTeamIds] TheSportsDB teams fetch failed', err);
  }

  // --- merge + report --------------------------------------------------
  for (const t of teams as TeamRow[]) {
    const found = resolved[t.id] ?? {};
    const missingKeys = (['footballData', 'apiFootball', 'theSportsDb'] as const).filter(
      (k) => found[k] == null && (t.source_ids as Record<string, unknown> | null)?.[k] == null,
    );
    if (missingKeys.length) unresolved[t.id] = missingKeys;

    if (Object.keys(found).length === 0) continue;
    const merged = { ...(t.source_ids ?? {}), ...found };
    const { error: upErr } = await db.from('teams').update({ source_ids: merged }).eq('id', t.id);
    if (upErr) console.error(`[resolveTeamIds] update failed for ${t.id}`, upErr);
    else console.log(`[resolveTeamIds] ${t.id}: ${JSON.stringify(found)}`);
  }

  const stillMissing = Object.entries(unresolved);
  if (stillMissing.length) {
    console.log('\n[resolveTeamIds] SIN RESOLVER (rellenar a mano por SQL):');
    for (const [id, keys] of stillMissing) console.log(`  - ${id}: falta ${keys.join(', ')}`);
  } else {
    console.log('\n[resolveTeamIds] los 20 equipos quedaron resueltos.');
  }
}

await main();
process.exit(0);
