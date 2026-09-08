// One-off: mete el id de TheSportsDB de los 31 clubes de Champions que no son
// de LaLiga en `teams.source_ids.theSportsDb`. Con eso:
//   - resolvePlayerPhotos trae sus recortes (strCutout).
//   - syncFixtures.crossReferenceIds usa su `eventsnext` para poner el id de
//     API-Football en los partidos UCL de extranjero-contra-extranjero (hoy
//     sin previsiones/cuotas — p.ej. Porto - Man City).
//
//   npm run -w @motm/ingest resolve-ucl-ids
//
// La mayoría van con id fijo (comprobado a mano); lo que quede se busca por
// nombre en TheSportsDB, rechazando femenino/filial. Lo que no case se
// imprime como SQL para rellenar a mano.

import { readFileSync } from 'node:fs';
try {
  const raw = readFileSync(new URL('../../.env', import.meta.url), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*(.*?)\s*$/);
    if (m && m[1] && process.env[m[1]] === undefined) {
      process.env[m[1]] = (m[2] ?? '').replace(/^(['"])(.*)\1$/, '$2');
    }
  }
} catch {
  /* Coolify: env real */
}

const { db } = await import('../db.js');
const { searchTeams } = await import('../sources/theSportsDB.js');
const { UCL_TEAMS } = await import('../lib/shared.js');

/** Ids de TheSportsDB verificados a mano (2026-09). Los que faltan se buscan. */
const KNOWN: Record<string, string> = {
  'aek-athens': '133753',
  arsenal: '133604',
  roma: '133682',
  'aston-villa': '133601',
  'bayern-munich': '133664',
  'borussia-dortmund': '133650',
  'club-brugge': '133789',
  'como-1907': '134243',
  'fc-porto': '134114',
  fenerbahce: '133807',
  feyenoord: '133758',
  'fk-bodo-glimt': '135497',
  galatasaray: '133804',
  'inter-milan': '133681',
  lask: '137261',
  'viking-fk': '134570',
  // La búsqueda por nombre devolvía clubes equivocados (PSG -> Torcy) o nada
  // (Lille): fijados a mano para que un re-run no vuelva a romperlos.
  'paris-saint-germain-psg': '133714',
  'losc-lille': '133711',
};

/** Nombres "de la calle" para buscar los que no están en KNOWN. */
const QUERIES: Record<string, string[]> = {
  'losc-lille': ['Lille', 'LOSC Lille'],
  'liverpool-fc': ['Liverpool'],
  'manchester-city': ['Manchester City'],
  'manchester-united': ['Manchester United'],
  'paris-saint-germain-psg': ['Paris Saint-Germain', 'Paris SG', 'PSG'],
  'psv-eindhoven': ['PSV Eindhoven', 'PSV'],
  'rb-leipzig': ['RB Leipzig'],
  'rc-lens': ['Lens', 'RC Lens'],
  'shakhtar-donetsk': ['Shakhtar Donetsk'],
  'slavia-praha': ['Slavia Prague', 'SK Slavia Prague'],
  'slovan-bratislava': ['Slovan Bratislava'],
  'sporting-cp': ['Sporting CP', 'Sporting Lisbon'],
  napoli: ['Napoli', 'SSC Napoli'],
  'vfb-stuttgart': ['VfB Stuttgart', 'Stuttgart'],
  'sabah-fk': ['Sabah FC', 'Sabah FK'], // Azerbaiyán — ojo con el Sabah de Malasia
};

const BAD = /women|femin|frauen|\bU1[5-9]\b|\bU2[0-3]\b|youth|reserves?|\bNXT\b|academy|futsal|\bB\b\s*$|\bII\b/i;
const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '').trim();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const ids = Object.keys(UCL_TEAMS);
const { data: rows } = await db.from('teams').select('id, name, source_ids').in('id', ids);
const unresolved: string[] = [];

for (const t of (rows ?? []) as Array<{ id: string; name: string; source_ids: Record<string, unknown> | null }>) {
  if (t.source_ids?.theSportsDb != null) {
    console.log(`  ${t.id}: ya tenía ${t.source_ids.theSportsDb}`);
    continue;
  }

  let tsdbId = KNOWN[t.id] ?? null;
  if (!tsdbId) {
    for (const q of QUERIES[t.id] ?? [t.name]) {
      try {
        const list = ((await searchTeams(q)).teams ?? []) as Array<{
          idTeam: string; strTeam?: string | null; strSport?: string | null;
        }>;
        const soccer = list.filter((x) => x.strSport === 'Soccer' && !BAD.test(x.strTeam ?? ''));
        const hit =
          soccer.find((x) => norm(x.strTeam ?? '') === norm(q)) ??
          soccer.find((x) => norm(x.strTeam ?? '').includes(norm(q))) ??
          soccer[0];
        if (hit) {
          tsdbId = hit.idTeam;
          console.log(`  ${t.id}: buscado "${q}" -> ${hit.idTeam} (${hit.strTeam})`);
          break;
        }
      } catch (err) {
        console.warn(`  ${t.id}: "${q}" falló`, (err as Error).message.slice(0, 70));
      }
      await sleep(2500); // free tier de TheSportsDB va MUY justa de rate
    }
  }

  if (!tsdbId) {
    unresolved.push(t.id);
    continue;
  }
  const merged = { ...(t.source_ids ?? {}), theSportsDb: tsdbId };
  const { error } = await db.from('teams').update({ source_ids: merged }).eq('id', t.id);
  if (error) console.error(`  ${t.id}: update falló`, error.message);
  else console.log(`  ${t.id} -> tsdb ${tsdbId}`);
}

if (unresolved.length) {
  console.log('\nSIN RESOLVER — pega en el SQL editor de Supabase el id correcto:');
  for (const id of unresolved) {
    console.log(`  update teams set source_ids = source_ids || '{"theSportsDb":"XXXX"}'::jsonb where id = '${id}';`);
  }
} else {
  console.log('\nlos 31 quedaron resueltos.');
}
process.exit(0);
