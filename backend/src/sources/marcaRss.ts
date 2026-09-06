/**
 * Adapter: RSS de Marca — única fuente de noticias. Verificado 2026-09-06:
 * los 20 clubes tienen feed propio (~45 items cada uno) más el de Primera.
 * No hay API: `api.marca.com` no resuelve y `/api/` da 404, solo RSS.
 *
 * Se eligió frente a las alternativas porque es un solo medio (sin la
 * redundancia de un agregador), trae `<category>` con equipo Y personas —
 * de ahí salen `team_id` y `subject` sin adivinar nada del titular — y no
 * pide credenciales. Descartadas: AS (feed congelado en 2022), Relevo (no
 * tiene RSS), Google News (su copyright prohíbe el uso no personal),
 * ESPN /news (inglés y 70% clips de vídeo).
 *
 * Mismo patrón defensivo que sources/espn.ts: throttle de un carril, backoff
 * sin reintento y circuit breaker por proceso. Nunca lanza.
 */
import { TEAMS, type TeamId } from '../lib/shared.js';

const BASE = 'https://estaticos.marca.com/rss/futbol';
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/** Slug del feed por equipo. Ojo: Rayo y Racing NO siguen el patrón del
 *  resto (`rayo-vallecano` y `racing` dan 404) — comprobado uno a uno. */
const FEED_SLUG: Record<TeamId, string> = {
  'real-madrid': 'real-madrid',
  barcelona: 'barcelona',
  'atletico-madrid': 'atletico',
  'athletic-bilbao': 'athletic',
  villarreal: 'villarreal',
  'real-betis': 'betis',
  'celta-vigo': 'celta',
  'rayo-vallecano': 'rayo',
  osasuna: 'osasuna',
  'real-sociedad': 'real-sociedad',
  sevilla: 'sevilla',
  valencia: 'valencia',
  getafe: 'getafe',
  alaves: 'alaves',
  espanyol: 'espanyol',
  levante: 'levante',
  elche: 'elche',
  'racing-santander': 'racing-santander',
  deportivo: 'deportivo',
  malaga: 'malaga',
};

// --- throttle + breaker ----------------------------------------------------

const MIN_GAP_MS = 1_500;
const FAILURE_THRESHOLD = 3;
const CIRCUIT_COOLDOWN_MS = 30 * 60_000;

let queueTail: Promise<void> = Promise.resolve();
let lastFetchAt = 0;
let consecutiveFailures = 0;
let circuitOpenUntil = 0;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function throttledRun<T>(fn: () => Promise<T>): Promise<T> {
  const result = queueTail.then(async () => {
    const wait = MIN_GAP_MS - (Date.now() - lastFetchAt);
    if (wait > 0) await sleep(wait);
    lastFetchAt = Date.now();
    return fn();
  });
  queueTail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

export function marcaCircuitStatus() {
  return {
    open: Date.now() < circuitOpenUntil,
    openUntil: circuitOpenUntil > 0 ? new Date(circuitOpenUntil).toISOString() : null,
    consecutiveFailures,
  };
}

async function getXml(url: string): Promise<string | null> {
  if (Date.now() < circuitOpenUntil) return null;
  try {
    const res = await throttledRun(() =>
      fetch(url, { headers: { 'User-Agent': BROWSER_UA, Accept: 'application/rss+xml,application/xml' } }),
    );
    if (!res.ok) {
      consecutiveFailures++;
      console.warn(`[marca] ${res.status} en ${url} (${consecutiveFailures}/${FAILURE_THRESHOLD})`);
      if (consecutiveFailures >= FAILURE_THRESHOLD) {
        circuitOpenUntil = Date.now() + CIRCUIT_COOLDOWN_MS;
        console.error('[marca] circuito abierto — pausando 30min');
      }
      return null;
    }
    consecutiveFailures = 0;
    return await res.text();
  } catch (err) {
    console.warn(`[marca] error de red en ${url}`, err);
    return null;
  }
}

// --- parser ----------------------------------------------------------------

export type MarcaItem = {
  title: string;
  link: string;
  summary: string | null;
  author: string | null;
  publishedAt: string | null;
  /** `<category>` crudas: mezclan competición, equipos y personas. */
  categories: string[];
  /** Feed del que salió — para atribuir el equipo cuando las categorías no bastan. */
  feedTeamId: TeamId | null;
};

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function tag(block: string, name: string): string | null {
  // `[^]` = cualquier carácter: en una template literal `\s` se colapsaría a `s`.
  const m = new RegExp("<" + name + "[^>]*>([^]*?)</" + name + ">").exec(block);
  return m ? decode(m[1] ?? '') || null : null;
}

function parseFeed(xml: string, feedTeamId: TeamId | null): MarcaItem[] {
  const out: MarcaItem[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const block = m[1] ?? '';
    const title = tag(block, 'title');
    const link = tag(block, 'link');
    if (!title || !link) continue;

    const categories = [...block.matchAll(/<category[^>]*>([\s\S]*?)<\/category>/g)]
      .map((c) => decode(c[1] ?? ''))
      .filter(Boolean);

    const pub = tag(block, 'pubDate');
    const parsed = pub ? new Date(pub) : null;

    out.push({
      title,
      link: link.split('#')[0] ?? link,
      summary: tag(block, 'media:description') ?? tag(block, 'description'),
      author: tag(block, 'dc:creator'),
      publishedAt: parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : null,
      categories,
      feedTeamId,
    });
  }
  return out;
}

/** Feed general de Primera + los 20 de equipo, deduplicado por URL. */
export async function fetchAllNews(): Promise<MarcaItem[]> {
  const byUrl = new Map<string, MarcaItem>();

  const league = await getXml(`${BASE}/primera-division.xml`);
  if (league) for (const it of parseFeed(league, null)) byUrl.set(it.link, it);

  for (const teamId of Object.keys(FEED_SLUG) as TeamId[]) {
    const xml = await getXml(`${BASE}/${FEED_SLUG[teamId]}.xml`);
    if (!xml) continue;
    for (const it of parseFeed(xml, teamId)) {
      // El feed de equipo es más específico: si ya vino del general, le
      // añadimos el equipo en vez de descartarlo.
      const prev = byUrl.get(it.link);
      if (prev && !prev.feedTeamId) prev.feedTeamId = teamId;
      else if (!prev) byUrl.set(it.link, it);
    }
  }

  console.log(`[marca] ${byUrl.size} noticias únicas de ${Object.keys(TEAMS).length + 1} feeds`);
  return [...byUrl.values()];
}
