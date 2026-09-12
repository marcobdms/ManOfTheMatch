/**
 * Adapter: RSS de AS — segunda fuente además de Marca. Verificado 2026-09-12:
 * las URLs viejas (as.com/rss/futbol/*.xml) están congeladas desde 2022 (así
 * se descartó AS la primera vez), pero AS migró su RSS a un sistema MRSS que
 * SÍ está vivo — `feeds.as.com/mrss-s/.../subsection/primera` traía noticias
 * de hoy mismo al comprobarlo. Un solo feed de sección cubre las 20 clubes
 * (a diferencia de Marca, que necesita un feed por equipo), y trae
 * `<category>` con equipo y persona igual que Marca — mismo aprovechamiento,
 * sin adivinar nada del titular.
 *
 * Mismo patrón defensivo que marcaRss.ts/espn.ts: throttle de un carril,
 * backoff sin reintento y circuit breaker por proceso. Nunca lanza.
 */
const URL = 'https://feeds.as.com/mrss-s/pages/as/site/as.com/section/futbol/subsection/primera';
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const FAILURE_THRESHOLD = 3;
const CIRCUIT_COOLDOWN_MS = 30 * 60_000;
let consecutiveFailures = 0;
let circuitOpenUntil = 0;

export function asCircuitStatus() {
  return {
    open: Date.now() < circuitOpenUntil,
    openUntil: circuitOpenUntil > 0 ? new Date(circuitOpenUntil).toISOString() : null,
    consecutiveFailures,
  };
}

export type AsItem = {
  title: string;
  link: string;
  summary: string | null;
  author: string | null;
  publishedAt: string | null;
  /** `<category>` crudas: mezclan competición, equipos y personas. */
  categories: string[];
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
  const m = new RegExp('<' + name + '[^>]*>([^]*?)</' + name + '>').exec(block);
  return m ? decode(m[1] ?? '') || null : null;
}

function parseFeed(xml: string): AsItem[] {
  const out: AsItem[] = [];
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
      summary: tag(block, 'description'),
      author: tag(block, 'dc:creator'),
      publishedAt: parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : null,
      categories,
    });
  }
  return out;
}

export async function fetchAsNews(): Promise<AsItem[]> {
  if (Date.now() < circuitOpenUntil) return [];
  try {
    const res = await fetch(URL, {
      headers: { 'User-Agent': BROWSER_UA, Accept: 'application/rss+xml,application/xml' },
    });
    if (!res.ok) {
      consecutiveFailures++;
      console.warn(`[as] ${res.status} en el feed (${consecutiveFailures}/${FAILURE_THRESHOLD})`);
      if (consecutiveFailures >= FAILURE_THRESHOLD) {
        circuitOpenUntil = Date.now() + CIRCUIT_COOLDOWN_MS;
        console.error('[as] circuito abierto — pausando 30min');
      }
      return [];
    }
    consecutiveFailures = 0;
    const items = parseFeed(await res.text());
    console.log(`[as] ${items.length} noticias`);
    return items;
  } catch (err) {
    console.warn('[as] error de red', err);
    return [];
  }
}
