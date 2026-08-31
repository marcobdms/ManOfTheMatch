/**
 * Resuelve la foto recortada de cada jugador de LaLiga y la deja lista en el
 * bucket `player-photos` de Supabase Storage + la tabla `player_photos`.
 *
 *   npm run resolve-photos            # todos los equipos
 *   npm run resolve-photos barcelona  # uno suelto
 *
 * Dos fuentes, por orden de calidad:
 *   1. TheSportsDB `strCutout` — PNG de 500px con alfa real, sin retoque. Su
 *      plan gratuito devuelve ~10 jugadores por equipo, así que no cubre un once.
 *   2. API-Football — cubre a todos, pero son 150px con fondo blanco opaco.
 *      Se recortan aquí (ver cutoutWhiteBackground) porque el blanco hay que
 *      quitarlo SOLO donde toca el borde: si se borra todo el blanco, los
 *      jugadores pierden los dientes y las camisetas blancas se agujerean.
 *
 * Se ejecuta a mano, no en cron: las plantillas cambian en pretemporada y en
 * enero, y el recorte necesita ffmpeg (que está en local, no en el worker).
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { db } from '../db.js';
import { TEAMS } from '../lib/shared.js';
import type { TeamId } from '../lib/shared.js';
import { lastKey, nameKey } from '../lib/playerPhotos.js';
import { refreshTeamCache, apiFootballIdForTeam, tsdbIdForTeam } from '../lib/ids.js';

const BUCKET = 'player-photos';
const TSDB_KEY = process.env.THESPORTSDB_KEY;
const AF_KEY = process.env.API_FOOTBALL_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

type Resolved = { name: string; url: string; source: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function ensureBucket(): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY as string,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }),
  });
  if (res.ok) {
    console.log(`[photos] bucket "${BUCKET}" creado`);
    return;
  }
  const body = await res.text();
  if (res.status === 409 || body.includes('already exists')) return;
  throw new Error(`no se pudo crear el bucket: ${res.status} ${body}`);
}

async function upload(objectPath: string, png: Buffer): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${objectPath}`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY as string,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'image/png',
      'x-upsert': 'true',
    },
    body: new Uint8Array(png),
  });
  if (!res.ok) throw new Error(`upload ${objectPath}: ${res.status} ${await res.text()}`);
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${objectPath}`;
}

/**
 * Quita el fondo blanco propagando desde el marco hacia dentro: solo se vuelve
 * transparente el blanco CONECTADO al borde exterior. Los blancos interiores
 * (dientes, ojos, una camiseta blanca) son islas y se conservan. Después se
 * suaviza el borde y se apaga el tinte que deja el degradado del pelo, que es
 * lo que se veía como halo con un `colorkey` normal.
 */
function cutoutWhiteBackground(src: Buffer, size = 500, tol = 34): Buffer {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'motm-photo-'));
  const inPath = path.join(dir, 'in.png');
  const rawPath = path.join(dir, 'out.rgba');
  const outPath = path.join(dir, 'out.png');
  try {
    fs.writeFileSync(inPath, new Uint8Array(src));
    const raw = execFileSync(
      'ffmpeg',
      [
        '-v', 'error', '-i', inPath,
        '-vf', `scale=${size}:${size}:flags=lanczos`,
        '-f', 'rawvideo', '-pix_fmt', 'rgba', '-',
      ],
      { maxBuffer: 1 << 28 },
    );
    const px = Buffer.from(raw);
    const n = size * size;
    const alpha = new Uint8Array(n).fill(255);
    const seen = new Uint8Array(n);
    const isBg = (i: number): boolean => {
      const o = i * 4;
      return px[o]! >= 255 - tol && px[o + 1]! >= 255 - tol && px[o + 2]! >= 255 - tol;
    };

    const queue: number[] = [];
    const seed = (i: number) => {
      if (!seen[i] && isBg(i)) {
        seen[i] = 1;
        queue.push(i);
      }
    };
    for (let x = 0; x < size; x++) {
      seed(x);
      seed((size - 1) * size + x);
    }
    for (let y = 0; y < size; y++) {
      seed(y * size);
      seed(y * size + size - 1);
    }
    for (let h = 0; h < queue.length; h++) {
      const i = queue[h]!;
      alpha[i] = 0;
      const x = i % size;
      const y = (i / size) | 0;
      if (x > 0) seed(i - 1);
      if (x < size - 1) seed(i + 1);
      if (y > 0) seed(i - size);
      if (y < size - 1) seed(i + size);
    }

    const soft = Uint8Array.from(alpha);
    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        const i = y * size + x;
        let sum = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) sum += alpha[i + dy * size + dx]!;
        }
        const avg = sum / 9;
        if (avg !== 255 && avg !== 0) soft[i] = Math.max(0, Math.min(255, Math.round(avg * 1.6 - 40)));
      }
    }
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      const a = soft[i]!;
      px[o + 3] = a;
      if (a > 0 && a < 255) {
        const k = a / 255;
        px[o] = Math.round(px[o]! * k);
        px[o + 1] = Math.round(px[o + 1]! * k);
        px[o + 2] = Math.round(px[o + 2]! * k);
      }
    }
    fs.writeFileSync(rawPath, px);
    execFileSync('ffmpeg', [
      '-y', '-v', 'error',
      '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${size}x${size}`, '-i', rawPath,
      '-frames:v', '1', '-update', '1', outPath,
    ]);
    return fs.readFileSync(outPath);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function fetchBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

type TsdbPlayer = { strPlayer?: string; strCutout?: string };
type AfPlayer = { name?: string; photo?: string };

async function resolveTeam(teamId: TeamId): Promise<Resolved[]> {
  const out = new Map<string, Resolved>();

  // 1) TheSportsDB: recortes nativos, sin retoque.
  const tsdb = tsdbIdForTeam(teamId);
  if (tsdb && TSDB_KEY) {
    const res = await fetch(
      `https://www.thesportsdb.com/api/v1/json/${TSDB_KEY}/lookup_all_players.php?id=${tsdb}`,
    );
    const json = (await res.json().catch(() => null)) as { player?: TsdbPlayer[] } | null;
    for (const p of json?.player ?? []) {
      if (!p.strPlayer || !p.strCutout) continue;
      const png = await fetchBuffer(p.strCutout);
      if (!png) continue;
      const key = nameKey(p.strPlayer);
      const url = await upload(`${teamId}/${key.replace(/\s/g, '-')}.png`, png);
      out.set(key, { name: p.strPlayer, url, source: 'thesportsdb' });
      await sleep(250);
    }
  }

  // 2) API-Football: cubre al resto, recortando el fondo blanco aquí.
  const afId = apiFootballIdForTeam(teamId);
  if (afId && AF_KEY) {
    const res = await fetch(`https://v3.football.api-sports.io/players/squads?team=${afId}`, {
      headers: { 'x-apisports-key': AF_KEY },
    });
    const json = (await res.json().catch(() => null)) as
      | { response?: Array<{ players?: AfPlayer[] }> }
      | null;
    for (const p of json?.response?.[0]?.players ?? []) {
      if (!p.name || !p.photo) continue;
      const key = nameKey(p.name);
      if (out.has(key)) continue; // ya lo cubrió TheSportsDB, que viene mejor
      const raw = await fetchBuffer(p.photo);
      if (!raw) continue;
      let png: Buffer;
      try {
        png = cutoutWhiteBackground(raw);
      } catch (err) {
        console.warn(`  recorte falló para ${p.name}:`, (err as Error).message.slice(0, 80));
        continue;
      }
      const url = await upload(`${teamId}/${key.replace(/\s/g, '-')}.png`, png);
      out.set(key, { name: p.name, url, source: 'api-football' });
    }
  }

  return [...out.values()];
}

async function main(): Promise<void> {
  if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  await refreshTeamCache();
  await ensureBucket();

  const only = process.argv[2];
  const teams = (Object.values(TEAMS) as Array<{ id: string }>)
    .map((t) => t.id as TeamId)
    .filter((id) => !only || id === only);

  let total = 0;
  for (const teamId of teams) {
    try {
      const resolved = await resolveTeam(teamId);
      if (!resolved.length) {
        console.log(`${teamId}: sin fotos`);
        continue;
      }
      const rows = resolved.map((r) => ({
        team_id: teamId,
        name_key: nameKey(r.name),
        last_key: lastKey(r.name),
        player_name: r.name,
        photo_url: r.url,
        source: r.source,
        updated_at: new Date().toISOString(),
      }));
      const { error } = await db.from('player_photos').upsert(rows, { onConflict: 'team_id,name_key' });
      if (error) throw new Error(error.message);
      total += rows.length;
      const nativos = resolved.filter((r) => r.source === 'thesportsdb').length;
      console.log(
        `${teamId}: ${rows.length} fotos (${nativos} recortes nativos, ${rows.length - nativos} procesadas)`,
      );
    } catch (err) {
      console.error(`${teamId} falló:`, (err as Error).message);
    }
  }
  console.log(`\ntotal: ${total} fotos`);
}

await main();
