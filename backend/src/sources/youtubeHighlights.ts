/**
 * Resumen en vídeo de un partido, buscado en los canales oficiales de YouTube
 * cuando Fotmob no lo trae. Fotmob se salta muchos resúmenes de LaLiga
 * (comprobado: Valencia-Barcelona de la J4 no estaba en Fotmob 8h después,
 * pero sí en YouTube desde la hora siguiente al pitido).
 *
 * Se usa el FEED RSS del canal (`/feeds/videos.xml?channel_id=…`): es gratis,
 * sin API key ni cuota, y devuelve los últimos 15 vídeos con título, fecha,
 * miniatura y si es Short. Como el worker mira esto cada pocos minutos, 15
 * entradas bastan para cazar cada resumen según se publica. Para partidos
 * viejos que se escaparon del feed queda Fotmob, que sí conserva histórico.
 *
 * No se rehospeda nada: se guarda el enlace de YouTube y se embebe/enlaza su
 * reproductor oficial, igual que con el de Fotmob.
 */
import type { CompetitionId } from '../lib/shared.js';

const UA = 'ManOfTheMatch/0.1 (+https://github.com/marcobdms/ManOfTheMatch)';
const FEED_TTL_MS = 8 * 60_000;

/**
 * Canales oficiales, por orden de preferencia. DAZN publica el resumen
 * completo con un título muy regular ("X vs Y (H-A) | Resumen … | Highlights
 * LALIGA EA SPORTS"); el de LALIGA a veces sale primero como Short vertical y
 * el vídeo largo llega después.
 */
const CHANNELS: Array<{ name: string; channelId: string }> = [
  { name: 'DAZN Fútbol', channelId: 'UCz9FiMLz6SOgR_4VEFvjeIA' },
  { name: 'LALIGA EA SPORTS', channelId: 'UCTv-XvfzLX3i4IGWAm4sbmA' },
];

/** Tokens que identifican a cada club en un título de YouTube. Basta con que
 *  aparezca UNO. Cuidado con los "Real" y los "Madrid": Real Madrid y Atlético
 *  comparten ciudad, así que se exige el nombre distintivo. */
const TEAM_TOKENS: Record<string, string[]> = {
  'real-madrid': ['real madrid'],
  barcelona: ['barcelona', 'barca'],
  'atletico-madrid': ['atletico de madrid', 'atletico madrid', 'atleti'],
  'athletic-bilbao': ['athletic club', 'athletic'],
  villarreal: ['villarreal'],
  'real-betis': ['betis'],
  'celta-vigo': ['celta'],
  'rayo-vallecano': ['rayo vallecano', 'rayo'],
  osasuna: ['osasuna'],
  'real-sociedad': ['real sociedad'],
  sevilla: ['sevilla'],
  valencia: ['valencia'],
  getafe: ['getafe'],
  alaves: ['alaves'],
  espanyol: ['espanyol'],
  levante: ['levante'],
  elche: ['elche'],
  'racing-santander': ['racing de santander', 'racing santander'],
  deportivo: ['deportivo de la coruna', 'deportivo la coruna', 'dep de la coruna', 'depor'],
  malaga: ['malaga'],
};

/** Un vídeo que NO es de LaLiga: DAZN sube resúmenes de Hypermotion, Liga F,
 *  Serie A, etc. con el mismo formato de título. */
const OTHER_COMP_RE =
  /hypermotion|liga f\b|serie a|premier league|bundesliga|ligue 1|copa del rey|eurocopa|nations league|libertadores|sudamericana|\bmls\b|brasileir|segunda|primera rfef|amistoso|friendly/i;

const LALIGA_RE = /laliga ea sports|la ?liga ea sports|laliga santander|\bla ?liga\b/i;
const UCL_RE = /champions league|uefa champions/i;
const SUMMARY_RE = /\bresumen\b|\bhighlights?\b|\bresumen y goles\b/i;

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

type FeedEntry = {
  videoId: string;
  title: string;
  published: number;
  thumbnail: string | null;
  isShort: boolean;
};

const feedCache = new Map<string, { at: number; entries: FeedEntry[] }>();

function parseFeed(xml: string): FeedEntry[] {
  const out: FeedEntry[] = [];
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const b = m[1] ?? '';
    const videoId = /<yt:videoId>([^<]+)<\/yt:videoId>/.exec(b)?.[1] ?? '';
    const title = /<title>([^<]*)<\/title>/.exec(b)?.[1] ?? '';
    if (!videoId || !title) continue;
    const publishedRaw = /<published>([^<]+)<\/published>/.exec(b)?.[1] ?? '';
    const published = publishedRaw ? Date.parse(publishedRaw) : NaN;
    const thumbnail = /<media:thumbnail url="([^"]+)"/.exec(b)?.[1] ?? null;
    const altHref = /<link rel="alternate" href="([^"]+)"/.exec(b)?.[1] ?? '';
    out.push({
      videoId,
      title: title.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'"),
      published: Number.isFinite(published) ? published : 0,
      thumbnail,
      isShort: altHref.includes('/shorts/'),
    });
  }
  return out;
}

async function getFeed(channelId: string): Promise<FeedEntry[]> {
  const cached = feedCache.get(channelId);
  if (cached && Date.now() - cached.at < FEED_TTL_MS) return cached.entries;
  try {
    const res = await fetch(
      `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`,
      { headers: { 'User-Agent': UA, Accept: 'application/atom+xml,application/xml' } },
    );
    if (!res.ok) {
      console.warn(`[yt-highlights] feed ${channelId} → ${res.status}`);
      return cached?.entries ?? [];
    }
    const entries = parseFeed(await res.text());
    feedCache.set(channelId, { at: Date.now(), entries });
    return entries;
  } catch (err) {
    console.warn(`[yt-highlights] feed ${channelId} falló`, err);
    return cached?.entries ?? [];
  }
}

/** Marcador escrito en el título: "(0-5)" o "VALENCIA 0 - 5 BARCELONA". */
function scoreInTitle(title: string): [number, number] | null {
  const m = /\(?\b(\d{1,2})\s*[-–]\s*(\d{1,2})\b\)?/.exec(title);
  if (!m) return null;
  return [Number(m[1]), Number(m[2])];
}

export type HighlightHit = { url: string; thumbnail: string | null; source: string };

export type HighlightQuery = {
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeScore: number | null;
  awayScore: number | null;
  competitionId: CompetitionId;
  /** Para descartar vídeos publicados antes del partido (rueda de prensa, previa). */
  kickoffMs: number;
};

/**
 * Devuelve el resumen del partido si aparece en alguno de los canales, o null.
 * Exige: título de resumen, de la competición correcta, con AMBOS equipos, y
 * —si lo hay en el título— con el marcador correcto. Prefiere vídeo largo a
 * Short y, entre varios, el más reciente.
 */
export async function findYoutubeHighlight(q: HighlightQuery): Promise<HighlightHit | null> {
  const homeTokens = q.homeTeamId ? TEAM_TOKENS[q.homeTeamId] ?? [] : [];
  const awayTokens = q.awayTeamId ? TEAM_TOKENS[q.awayTeamId] ?? [] : [];
  if (!homeTokens.length || !awayTokens.length) return null;

  const compOk = (t: string) => (q.competitionId === 'ucl' ? UCL_RE.test(t) : LALIGA_RE.test(t));

  const candidates: Array<{ entry: FeedEntry; source: string }> = [];
  for (const ch of CHANNELS) {
    for (const entry of await getFeed(ch.channelId)) {
      const t = normalize(entry.title);
      if (!SUMMARY_RE.test(t)) continue;
      if (OTHER_COMP_RE.test(t)) continue;
      if (!compOk(t)) continue;
      if (!homeTokens.some((tok) => t.includes(tok))) continue;
      if (!awayTokens.some((tok) => t.includes(tok))) continue;
      // Un resumen no puede ser anterior al partido.
      if (entry.published && entry.published < q.kickoffMs) continue;

      const score = scoreInTitle(entry.title);
      if (score && q.homeScore != null && q.awayScore != null) {
        if (score[0] !== q.homeScore || score[1] !== q.awayScore) continue;
      }
      candidates.push({ entry, source: `youtube:${ch.name}` });
    }
  }
  if (!candidates.length) return null;

  candidates.sort((a, b) => {
    if (a.entry.isShort !== b.entry.isShort) return a.entry.isShort ? 1 : -1;
    return b.entry.published - a.entry.published;
  });

  const best = candidates[0]!;
  return {
    url: `https://www.youtube.com/watch?v=${best.entry.videoId}`,
    thumbnail: best.entry.thumbnail,
    source: best.source,
  };
}
