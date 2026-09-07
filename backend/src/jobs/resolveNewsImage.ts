/**
 * Busca foto libre para las noticias publicadas y la deja en el bucket
 * `news-images`. Mismo patrón que scripts/resolvePlayerPhotos.ts: se resuelve
 * una vez, se guarda, y se sirve desde nuestro almacenamiento.
 *
 * DESACTIVADO por ahora (`NEWS_IMAGES_WIKIMEDIA` no está a "1"): las fotos de
 * Wikimedia no acertaban —Pedri con España, jugadores con ex-clubes, firmando
 * autógrafos— y la carta con el escudo del club sobre su color, que sí
 * funciona, es lo único que se publica. Para reactivar la búsqueda: poner
 * NEWS_IMAGES_WIKIMEDIA=1 en el entorno.
 */
import { db } from '../db.js';
import { withRun } from '../lib/run.js';
import { resolveSubjectImage } from '../sources/wikimedia.js';
import { TEAM_NAME } from '../lib/newsTaxonomy.js';
import type { TeamId } from '../lib/shared.js';

const WIKIMEDIA_ENABLED = process.env.NEWS_IMAGES_WIKIMEDIA === '1';
const BUCKET = 'news-images';
const PER_RUN = 5;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

let bucketReady = false;

async function ensureBucket(): Promise<void> {
  if (bucketReady) return;
  const res = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY as string,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }),
  });
  const body = res.ok ? '' : await res.text();
  if (res.ok || res.status === 409 || body.includes('already exists')) {
    bucketReady = true;
    return;
  }
  throw new Error(`no se pudo crear el bucket: ${res.status} ${body}`);
}

async function upload(objectPath: string, bytes: Uint8Array, contentType: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${objectPath}`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY as string,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': contentType,
      'x-upsert': 'true',
    },
    body: bytes,
  });
  if (!res.ok) throw new Error(`upload ${objectPath}: ${res.status} ${await res.text()}`);
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${objectPath}`;
}

type Row = { id: string; subject: string | null; team_id: string | null };

export function resolveNewsImages() {
  return withRun('resolveNewsImages', 'news-images', async () => {
    const { data } = await db
      .from('news')
      .select('id, subject, team_id')
      .eq('status', 'published')
      .eq('image_state', 'pending')
      .order('published_at', { ascending: false })
      .limit(PER_RUN);

    const rows = (data ?? []) as unknown as Row[];
    if (!rows.length) return 0;

    if (!WIKIMEDIA_ENABLED) {
      // Todas a la carta del escudo; no se llama a Wikimedia.
      const ids = rows.map((r) => r.id);
      await db.from('news').update({ image_state: 'fallback' }).in('id', ids);
      return 0;
    }

    let resolved = 0;
    for (const row of rows) {
      try {
        // El club va como pista para poder descartar fotos con otra camiseta
        // (la categoría de un jugador incluye su selección y sus ex-equipos).
        const clubHints = row.team_id
          ? [TEAM_NAME[row.team_id as TeamId] ?? '', row.team_id.replace(/-/g, ' ')].filter(Boolean)
          : [];
        // Sin protagonista no hay a quién fotografiar: directo a la carta.
        const img = row.subject ? await resolveSubjectImage(row.subject, clubHints) : null;
        if (!img) {
          await db.from('news').update({ image_state: 'fallback' }).eq('id', row.id);
          continue;
        }

        await ensureBucket();
        const res = await fetch(img.url, { headers: { 'User-Agent': 'ManOfTheMatch/0.1' } });
        if (!res.ok) {
          await db.from('news').update({ image_state: 'fallback' }).eq('id', row.id);
          continue;
        }
        const contentType = res.headers.get('content-type') ?? 'image/jpeg';
        const ext = contentType.includes('png') ? 'png' : 'jpg';
        const bytes = new Uint8Array(await res.arrayBuffer());
        const publicUrl = await upload(`${row.id}.${ext}`, bytes, contentType);

        await db
          .from('news')
          .update({
            image_url: publicUrl,
            image_author: img.author,
            image_license: img.license,
            image_license_url: img.licenseUrl,
            image_source_url: img.sourceUrl,
            subject_qid: img.qid,
            image_state: 'resolved',
          })
          .eq('id', row.id);
        resolved++;
      } catch (err) {
        console.error(`[resolveNewsImages] ${row.id} falló`, err);
        await db.from('news').update({ image_state: 'fallback' }).eq('id', row.id);
      }
    }
    return resolved;
  });
}
