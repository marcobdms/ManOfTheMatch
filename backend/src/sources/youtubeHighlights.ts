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
 * Canales oficiales por competición. Se busca SOLO en los de la competición
 * del partido: DAZN/LALIGA no suben Champions y los de Champions no suben
 * LaLiga, así que mezclarlos solo añade ruido y peticiones.
 *
 * LaLiga: DAZN publica el resumen completo con un título muy regular ("X vs Y
 * (H-A) | Resumen … | Highlights LALIGA EA SPORTS"); el de LALIGA a veces sale
 * primero como Short vertical y el vídeo largo llega después.
 *
 * Champions: DAZN Fútbol SÍ sube el resumen por partido en español ("Real
 * Madrid vs Inter (2-1) | Resumen y goles | Highlights UEFA Champions
 * League"), pero solo del partido estrella de la jornada — el resto de los
 * seis no le llegan a tiempo al feed de 15 entradas. TNT Sports Football
 * (derechos en UK) SÍ sube resumen de TODOS los partidos, con un título
 * regular ("... | Equipo 2-1 Equipo | UEFA Champions League Highlights") —
 * va primero por eso. Se usa su PLAYLIST dedicada a resúmenes ("UEFA
 * Champions League Match Highlights 2026/27"), no el canal general: el canal
 * mezcla entrevistas y análisis y el resumen se cae del feed en horas; la
 * playlist tarda más en desplazarlo. Se comprueban las DOS: la playlist no
 * recibe cada partido al momento (va por detrás, verificado: se le escapó
 * toda la J2), así que hace falta el canal general para lo recién publicado
 * y la playlist como red de seguridad de lo que el canal ya se dejó atrás.
 * CBS y UEFA quedan detrás de las dos como último recurso; si nadie tiene el
 * partido, se cae al recopilatorio de la jornada.
 */
type Channel = { name: string; channelId?: string; playlistId?: string };

const LALIGA_CHANNELS: Channel[] = [
  { name: 'DAZN Fútbol', channelId: 'UCz9FiMLz6SOgR_4VEFvjeIA' },
  { name: 'LALIGA EA SPORTS', channelId: 'UCTv-XvfzLX3i4IGWAm4sbmA' },
];

const UCL_CHANNELS: Channel[] = [
  { name: 'TNT Sports Football', channelId: 'UC4i_9WvfPRTuRWEaWyfKuFw' },
  { name: 'TNT Sports Football (playlist)', playlistId: 'PLL5UZqtrgqxI' },
  { name: 'DAZN Fútbol', channelId: 'UCz9FiMLz6SOgR_4VEFvjeIA' },
  { name: 'CBS Sports Golazo', channelId: 'UCET00YnetHT7tOpu12v8jxg' },
  { name: 'UEFA', channelId: 'UCyGa1YEx9ST66rYrJTGIKOw' },
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

  // --- Clubes de Champions (títulos en inglés de CBS/UEFA). Tokens elegidos
  //     para no colisionar por substring: nada de "villa" (Villarreal),
  //     "city" ni "united" a secas. ---
  'aek-athens': ['aek athens', 'aek'],
  arsenal: ['arsenal'],
  roma: ['as roma', 'roma'],
  'aston-villa': ['aston villa'],
  'bayern-munich': ['bayern munich', 'bayern munchen', 'bayern'],
  'borussia-dortmund': ['borussia dortmund', 'dortmund'],
  'club-brugge': ['club brugge', 'brugge', 'brujas'],
  'como-1907': ['como 1907'],
  'fc-porto': ['fc porto', 'porto'],
  fenerbahce: ['fenerbahce', 'fener'],
  feyenoord: ['feyenoord'],
  'fk-bodo-glimt': ['bodo/glimt', 'bodo glimt', 'bodo'],
  galatasaray: ['galatasaray'],
  'inter-milan': ['inter milan', 'internazionale', 'inter'],
  lask: ['lask linz', 'lask'],
  'losc-lille': ['lille', 'losc'],
  'liverpool-fc': ['liverpool'],
  'manchester-city': ['manchester city', 'man city'],
  'manchester-united': ['manchester united', 'man united', 'man utd'],
  'paris-saint-germain-psg': ['paris saint-germain', 'paris saint germain', 'paris sg', 'psg'],
  'psv-eindhoven': ['psv eindhoven', 'eindhoven', 'psv'],
  'rb-leipzig': ['rb leipzig', 'leipzig'],
  'rc-lens': ['rc lens', 'lens'],
  'sabah-fk': ['sabah'],
  'shakhtar-donetsk': ['shakhtar donetsk', 'shakhtar', 'donetsk'],
  'slavia-praha': ['slavia praha', 'slavia prague', 'slavia'],
  'slovan-bratislava': ['slovan bratislava', 'slovan'],
  'sporting-cp': ['sporting cp', 'sporting lisbon', 'sporting clube', 'sporting'],
  napoli: ['napoli'],
  'vfb-stuttgart': ['vfb stuttgart', 'stuttgart'],
  'viking-fk': ['viking fk', 'viking'],
};

/** Un vídeo que NO es de LaLiga: DAZN sube resúmenes de Hypermotion, Liga F,
 *  Serie A, etc. con el mismo formato de título. */
export const OTHER_COMP_RE =
  /hypermotion|liga f\b|serie a|premier league|bundesliga|ligue 1|copa del rey|eurocopa|nations league|europa league|conference league|libertadores|sudamericana|\bmls\b|brasileir|segunda|primera rfef|amistoso|friendly/i;

const LALIGA_RE = /laliga ea sports|la ?liga ea sports|laliga santander|\bla ?liga\b/i;
const UCL_RE = /champions league|uefa champions/i;
const SUMMARY_RE = /\bresumen\b|\bhighlights?\b|\bresumen y goles\b/i;

function normalize(s: string): string {
  return s
    .toLowerCase()
    // ø/æ/å no son letra+acento — NFD no las toca (Bodø/Glimt, noruego).
    .replace(/ø/g, 'o')
    .replace(/æ/g, 'ae')
    .replace(/å/g, 'a')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export type FeedEntry = {
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

async function fetchFeed(cacheKey: string, url: string): Promise<FeedEntry[]> {
  const cached = feedCache.get(cacheKey);
  if (cached && Date.now() - cached.at < FEED_TTL_MS) return cached.entries;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/atom+xml,application/xml' },
    });
    if (!res.ok) {
      console.warn(`[yt-highlights] feed ${cacheKey} → ${res.status}`);
      return cached?.entries ?? [];
    }
    const entries = parseFeed(await res.text());
    feedCache.set(cacheKey, { at: Date.now(), entries });
    return entries;
  } catch (err) {
    console.warn(`[yt-highlights] feed ${cacheKey} falló`, err);
    return cached?.entries ?? [];
  }
}

export async function getFeed(channelId: string): Promise<FeedEntry[]> {
  return fetchFeed(channelId, `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
}

/** Feed de una PLAYLIST en vez de un canal entero — se usa para la de "Match
 *  Highlights" de TNT, que se desplaza más despacio que su canal general. */
async function getPlaylistFeed(playlistId: string): Promise<FeedEntry[]> {
  return fetchFeed(
    `playlist:${playlistId}`,
    `https://www.youtube.com/feeds/videos.xml?playlist_id=${playlistId}`,
  );
}

/** Entradas de un `Channel`, sea canal o playlist. */
function entriesFor(ch: Channel): Promise<FeedEntry[]> {
  if (ch.playlistId) return getPlaylistFeed(ch.playlistId);
  if (ch.channelId) return getFeed(ch.channelId);
  return Promise.resolve([]);
}

/** Marcador escrito en el título: "(0-5)" o "VALENCIA 0 - 5 BARCELONA". */
function scoreInTitle(title: string): [number, number] | null {
  const m = /\(?\b(\d{1,2})\s*[-–]\s*(\d{1,2})\b\)?/.exec(title);
  if (!m) return null;
  return [Number(m[1]), Number(m[2])];
}

export type HighlightHit = {
  url: string;
  thumbnail: string | null;
  source: string;
  /** 'match' = resumen de ESTE partido. 'roundup' = recopilatorio de la
   *  jornada (Champions, cuando nadie publica el partido suelto). */
  kind: 'match' | 'roundup';
};

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
  const isUcl = q.competitionId === 'ucl';
  if (!homeTokens.length || !awayTokens.length) return isUcl ? findUclRoundup(q) : null;
  const compOk = (t: string) => (isUcl ? UCL_RE.test(t) : LALIGA_RE.test(t));
  const channels = isUcl ? UCL_CHANNELS : LALIGA_CHANNELS;

  const candidates: Array<{ entry: FeedEntry; source: string }> = [];
  for (const ch of channels) {
    for (const entry of await entriesFor(ch)) {
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
  // UEFA no deja resúmenes por partido en YouTube (verificado: ni Fotmob ni
  // CBS ni el canal de UEFA los publican). Lo que sí hay es el recopilatorio
  // de goles de la jornada, que incluye este partido.
  if (!candidates.length) return isUcl ? findUclRoundup(q) : null;

  candidates.sort((a, b) => {
    if (a.entry.isShort !== b.entry.isShort) return a.entry.isShort ? 1 : -1;
    return b.entry.published - a.entry.published;
  });

  const best = candidates[0]!;
  return {
    url: `https://www.youtube.com/watch?v=${best.entry.videoId}`,
    thumbnail: best.entry.thumbnail,
    source: best.source,
    kind: 'match',
  };
}

/** Recopilatorio de goles de la jornada de Champions ("ALL GOALS in MD1 of the
 *  UEFA Champions League: September 8, 2026"). No es un resumen del partido
 *  concreto —no existe -- pero sí contiene sus goles. Se acota a los vídeos
 *  publicados dentro de las 36h siguientes al pitido inicial para no colgar el
 *  recopilatorio de otra jornada. */
const ROUNDUP_RE = /all goals|todos los goles|goles de la jornada/i;
const ROUNDUP_WINDOW_MS = 36 * 3_600_000;

async function findUclRoundup(q: HighlightQuery): Promise<HighlightHit | null> {
  const hits: Array<{ entry: FeedEntry; source: string }> = [];
  for (const ch of UCL_CHANNELS) {
    for (const entry of await entriesFor(ch)) {
      const t = normalize(entry.title);
      if (!ROUNDUP_RE.test(t)) continue;
      if (!UCL_RE.test(t)) continue;
      if (OTHER_COMP_RE.test(t)) continue;
      if (entry.isShort) continue;
      if (!entry.published) continue;
      if (entry.published < q.kickoffMs) continue;
      if (entry.published - q.kickoffMs > ROUNDUP_WINDOW_MS) continue;
      hits.push({ entry, source: `youtube:${ch.name} (jornada)` });
    }
  }
  if (!hits.length) return null;
  hits.sort((a, b) => a.entry.published - b.entry.published); // el más cercano al partido
  const best = hits[0]!;
  return {
    url: `https://www.youtube.com/watch?v=${best.entry.videoId}`,
    thumbnail: best.entry.thumbnail,
    source: best.source,
    kind: 'roundup',
  };
}
