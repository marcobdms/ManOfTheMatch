/**
 * Fotos libres del protagonista de una noticia, vía Wikidata → Commons.
 *
 * Buscar en Commons por nombre a secas NO vale (misma lección que
 * scripts/resolvePlayerPhotos.ts): "Oihan Sancet" devuelve un .ogg de audio y
 * una foto del Rangers. Y `P18` de Wikidata tampoco, porque devuelve retratos
 * recortados — justo lo contrario de lo que queremos.
 *
 * El camino que sí funciona (verificado 2026-09-06):
 *   1. wbsearchentities, quedándose con la entidad cuya descripción sea de
 *      futbolista/entrenador. Sin ese filtro "Lamine Yamal" resuelve a la
 *      entidad "nombre masculino compuesto", no a la persona.
 *   2. P373 → categoría de Commons de esa persona.
 *   3. categorymembers + extmetadata → archivo con autor y licencia.
 *
 * Cobertura medida sobre 12 nombres reales del feed: 8/12. Los entrenadores
 * fallan más que los jugadores. Cuando no hay nada, el llamante pinta la
 * carta con el escudo (news.image_state = 'fallback').
 */
const CONTACT = process.env.CONTACT || 'marcobdms23@gmail.com';
const UA = `ManOfTheMatch/0.1 (https://github.com/marcobdms/ManOfTheMatch; ${CONTACT})`;

const MIN_GAP_MS = 1_000;
let lastFetchAt = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getJson<T>(url: string): Promise<T | null> {
  const wait = MIN_GAP_MS - (Date.now() - lastFetchAt);
  if (wait > 0) await sleep(wait);
  lastFetchAt = Date.now();
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (!res.ok) {
      console.warn(`[wikimedia] ${res.status} en ${url}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.warn('[wikimedia] error de red', err);
    return null;
  }
}

export type FreeImage = {
  url: string;
  author: string | null;
  license: string | null;
  licenseUrl: string | null;
  sourceUrl: string;
  qid: string;
};

const PERSON_RE = /futbolist|entrenador|football|soccer|manager|coach/i;

/** Señales de foto de partido en el nombre del archivo. Commons no etiqueta
 *  "acción", pero los archivos de partido casi siempre llevan el enfrentamiento,
 *  la competición o el año en el título. */
const ACTION_RE = /\bvs?\b|\d{4}|liga|copa|cup|match|partido|final|derbi|training|entrena|jornada|fc |cf |club/i;
/** Dos mayúsculas seguidas tipo "Philipp Lahm": si el archivo nombra a otra
 *  persona y no al protagonista, la foto es de ese otro. Pasó de verdad — la
 *  categoría de Hansi Flick contiene "Philipp Lahm lifts the 2014 FIFA World
 *  Cup.jpg", donde Flick ni sale de protagonista. */
const OTHER_PERSON_RE = /[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,}s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,}/;

/** Lo que nunca queremos: firmas, escudos, audio, retratos de estudio. */
const REJECT_RE = /signature|firma|\.ogg$|\.oga$|\.wav$|\.svg$|\.pdf$|logo|escudo|coat of arms|portrait|retrato|\bposado\b/i;

async function findEntity(name: string): Promise<string | null> {
  const url =
    'https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=es&uselang=es&limit=8&search=' +
    encodeURIComponent(name);
  const json = await getJson<{ search?: Array<{ id: string; description?: string }> }>(url);
  const hit = (json?.search ?? []).find((r) => PERSON_RE.test(r.description ?? ''));
  return hit?.id ?? null;
}

async function commonsCategory(qid: string): Promise<string | null> {
  const url = `https://www.wikidata.org/w/api.php?action=wbgetclaims&format=json&entity=${qid}&property=P373`;
  const json = await getJson<{ claims?: { P373?: Array<{ mainsnak?: { datavalue?: { value?: string } } }> } }>(url);
  return json?.claims?.P373?.[0]?.mainsnak?.datavalue?.value ?? null;
}

type CommonsPage = {
  title: string;
  imageinfo?: Array<{
    url?: string;
    /** Reescalada a `iiurlwidth`; el original puede ser de varios MB. */
    thumburl?: string;
    descriptionurl?: string;
    width?: number;
    height?: number;
    extmetadata?: Record<string, { value?: string }>;
  }>;
};

function plain(v: string | undefined): string | null {
  if (!v) return null;
  const t = v.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  return t || null;
}

const normalize = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export async function resolveSubjectImage(name: string): Promise<FreeImage | null> {
  const nameParts = normalize(name).split(/s+/).filter((p) => p.length > 3);
  const qid = await findEntity(name);
  if (!qid) return null;
  const category = await commonsCategory(qid);
  if (!category) return null;

  const url =
    'https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=categorymembers' +
    `&gcmtitle=${encodeURIComponent('Category:' + category)}&gcmtype=file&gcmlimit=50` +
    '&prop=imageinfo&iiprop=url|extmetadata|size&iiurlwidth=1200';
  const json = await getJson<{ query?: { pages?: Record<string, CommonsPage> } }>(url);
  const pages = Object.values(json?.query?.pages ?? {});
  if (!pages.length) return null;

  type Scored = { score: number; img: FreeImage };
  const scored = pages
    .map((p): Scored | null => {
      const ii = p.imageinfo?.[0];
      if (!ii?.url) return null;
      const title = p.title.replace(/^File:/, '');
      if (REJECT_RE.test(title)) return null;
      const w = ii.width ?? 0;
      const h = ii.height ?? 0;
      if (w < 600 || h < 400) return null;

      const meta = ii.extmetadata ?? {};
      const license = plain(meta.LicenseShortName?.value);
      // Solo licencias libres reutilizables con atribución.
      if (!license || /fair use|non-?free|no derivative/i.test(license)) return null;

      const flat = normalize(title);
      const namedHere = nameParts.some((p) => flat.includes(p));
      // Sin el nombre del protagonista en el archivo, si aparece el de OTRA
      // persona la foto no es suya.
      if (!namedHere && OTHER_PERSON_RE.test(title)) return null;

      let score = 0;
      if (namedHere) score += 5;
      if (ACTION_RE.test(title)) score += 3;
      if (w > h) score += 2; // apaisada encaja mejor en la carta
      if (w >= 1200) score += 1;
      return {
        score,
        img: {
          url: ii.thumburl ?? ii.url,
          author: plain(meta.Artist?.value),
          license,
          licenseUrl: plain(meta.LicenseUrl?.value),
          sourceUrl: ii.descriptionurl ?? `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title)}`,
          qid,
        },
      };
    })
    .filter((x): x is Scored => x !== null)
    .sort((a, b) => b.score - a.score);

  // Sin señal de acción no publicamos: preferimos la carta del escudo antes
  // que un posado institucional que no cuenta nada.
  const best = scored.find((s) => s.score >= 3) ?? null;
  return best?.img ?? null;
}
