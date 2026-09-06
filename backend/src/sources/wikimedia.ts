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
 * El filtro es DELIBERADAMENTE estricto. La categoría de un jugador contiene
 * toda su vida: fotos con su selección, con clubes anteriores, firmando
 * autógrafos y en alfombras rojas. Publicar eso en una noticia del Barça
 * (Pedri con España, Boyé con el AEK) queda peor que no publicar foto, y la
 * carta con el escudo del club ya es un fallback digno. Ante la duda, escudo.
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

/** Señal de que la foto es de un partido o un entrenamiento. Ojo: NO vale
 *  buscar un año suelto — casi todos los archivos de Commons llevan uno, y
 *  colaba "Eric_Garcia_autographs_2022.jpg" como si fuera acción. */
const ACTION_RE =
  /\bv\b|\bvs\b|\bversus\b|liga|laliga|copa|cup|match|partido|jornada|derbi|derby|final|training|entrena|warm.?up|kickoff/i;

/** Contextos que no son fútbol jugado. Todos vistos de verdad en producción. */
const NON_ACTION_RE =
  /autograph|autografo|firmando|signature|award|laureus|gala|red.?carpet|alfombra|premio|trophy.presentation|ceremon|interview|entrevista|press|rueda.de.prensa|portrait|retrato|posado|statue|estatua|mural|graffiti|museum|museo|wax|presentacion|photocall|balon.de.oro|ballon.d.or/i;

/** Extensiones y objetos que nunca son una foto de persona. */
const REJECT_RE = /\.(ogg|oga|wav|svg|pdf|webm|ogv)$|logo|escudo|coat.of.arms|crest|badge|kit\b|jersey|camiseta/i;

/** Dos palabras capitalizadas seguidas, tipo "Philipp Lahm": si el archivo
 *  nombra a otra persona y no al protagonista, la foto es de ese otro. Pasó de
 *  verdad — la categoría de Hansi Flick contiene "Philipp Lahm lifts the 2014
 *  FIFA World Cup.jpg", donde Flick ni sale. */
const OTHER_PERSON_RE = /\b[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,}\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,}\b/;

/**
 * Clubes y selecciones que NO son el equipo de la noticia. Si el archivo
 * nombra uno de estos y no nombra al nuestro, la camiseta de la foto será la
 * equivocada. Es lo que produjo "Pedri con España" en una crónica del Barça y
 * "Boyé con el AEK" en una del Alavés.
 */
const FOREIGN_CONTEXT_RE = new RegExp(
  [
    // selecciones y torneos de selecciones
    'seleccion', 'national.team', 'world.cup', 'mundial', 'copa.america', 'nations.league',
    'eurocopa', '\\beuro\\b', '\\bfifa\\b', 'olympic', 'olimpic',
    'spain', 'espana', 'france', 'francia', 'germany', 'alemania', 'italy', 'italia',
    'england', 'inglaterra', 'portugal', 'brazil', 'brasil', 'argentina', 'uruguay',
    'colombia', 'mexico', 'netherlands', 'holanda', 'belgium', 'belgica', 'croatia',
    'morocco', 'marruecos', 'japan', 'senegal', 'nigeria', 'ghana', 'ecuador', 'chile',
    // clubes extranjeros frecuentes en categorías de jugadores españoles
    'celtic', '\\baek\\b', 'ajax', 'benfica', 'porto', 'sporting', 'juventus', 'milan',
    'inter\\b', 'napoli', 'roma\\b', 'lazio', 'bayern', 'dortmund', 'leipzig', 'schalke',
    'psg', 'paris.saint', 'marseille', 'lyon', 'monaco', 'chelsea', 'arsenal', 'liverpool',
    'tottenham', 'everton', 'manchester', 'newcastle', 'leeds', 'wolves', 'fulham',
    'brighton', 'west.ham', 'aston.villa', 'rangers', 'feyenoord', '\\bpsv\\b',
    'galatasaray', 'fenerbahce', 'besiktas', 'shakhtar', 'dynamo', 'zenit', 'olympiacos',
    'panathinaikos', 'anderlecht', 'brugge', 'salzburg', 'basel',
  ].join('|'),
  'i',
);

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

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[_-]+/g, ' ');
}

/** Puntuación mínima para publicar. Con los pesos de abajo, sale solo si el
 *  archivo nombra a nuestro club, o bien nombra al protagonista Y es acción. */
const MIN_SCORE = 8;

/**
 * @param name      protagonista de la noticia (news.subject)
 * @param clubHints nombre y alias del club de la noticia ("Deportivo Alavés",
 *                  "Alaves"...). Sin esto no se puede saber si la camiseta de
 *                  la foto es la correcta.
 */
export async function resolveSubjectImage(
  name: string,
  clubHints: string[] = [],
): Promise<FreeImage | null> {
  const nameParts = normalize(name)
    .split(/\s+/)
    .filter((p) => p.length > 3);
  const clubParts = clubHints
    .flatMap((c) => normalize(c).split(/\s+/))
    .filter((p) => p.length > 3);

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
      if (REJECT_RE.test(title) || NON_ACTION_RE.test(title)) return null;

      const w = ii.width ?? 0;
      const h = ii.height ?? 0;
      if (w < 600 || h < 400) return null;

      const meta = ii.extmetadata ?? {};
      const license = plain(meta.LicenseShortName?.value);
      if (!license || /fair use|non-?free|no derivative/i.test(license)) return null;

      const flat = normalize(title);
      const namedHere = nameParts.some((p) => flat.includes(p));
      const ourClub = clubParts.length > 0 && clubParts.some((p) => flat.includes(p));

      // Camiseta equivocada: el archivo sitúa la foto en otro club o en una
      // selección, y no menciona al nuestro.
      if (!ourClub && FOREIGN_CONTEXT_RE.test(flat)) return null;
      // Sin el nombre del protagonista, si aparece el de otra persona la foto
      // es de ese otro.
      if (!namedHere && OTHER_PERSON_RE.test(title)) return null;

      let score = 0;
      if (ourClub) score += 6;
      if (namedHere) score += 5;
      if (ACTION_RE.test(flat)) score += 3;
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

  const best = scored.find((s) => s.score >= MIN_SCORE) ?? null;
  return best?.img ?? null;
}
