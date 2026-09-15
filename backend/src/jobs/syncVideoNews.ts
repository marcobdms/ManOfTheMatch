/**
 * Vídeos en el feed de noticias: ruedas de prensa, resúmenes, goles y
 * entrevistas de los canales oficiales. Se leen por RSS (gratis, sin API key
 * ni cuota) igual que los resúmenes de partido.
 *
 * NO se rehospeda ni se descarga nada: se guarda el enlace de YouTube y su
 * miniatura, y la app abre el reproductor oficial. Por eso tampoco pasan por
 * Groq — el titular del vídeo ES el contenido, reescribirlo no aporta y
 * gastaría presupuesto.
 */
import { db } from '../db.js';
import { withRun } from '../lib/run.js';
import {
  getFeed,
  LALIGA_RE,
  OTHER_COMP_RE,
  scoreInTitle,
  UCL_RE,
  type FeedEntry,
} from '../sources/youtubeHighlights.js';
import { teamsMentioned } from '../lib/newsTaxonomy.js';

/** Canales oficiales. El club aporta rueda de prensa; LaLiga/DAZN, goles.
 *  TNT Sports Football es el mismo canal que ya usa youtubeHighlights.ts
 *  para el resumen POR PARTIDO de Champions (tiene derechos en UK y sube los
 *  siete partidos, no solo el estelar) — aquí además trae el recopilatorio
 *  "ALL GOALS in MDx" de la jornada completa. */
const CHANNELS: Array<{ name: string; channelId: string; teamId?: string }> = [
  { name: 'LALIGA EA SPORTS', channelId: 'UCTv-XvfzLX3i4IGWAm4sbmA' },
  { name: 'DAZN Fútbol', channelId: 'UCz9FiMLz6SOgR_4VEFvjeIA' },
  { name: 'TNT Sports Football', channelId: 'UC4i_9WvfPRTuRWEaWyfKuFw' },
  { name: 'Real Madrid', channelId: 'UCWV3obpZVGgJ3j9FVhEjF2Q', teamId: 'real-madrid' },
  { name: 'FC Barcelona', channelId: 'UC14UlmYlSNiQCBe9Eookf_A', teamId: 'barcelona' },
  { name: 'Atlético de Madrid', channelId: 'UCuzKFwdh7z2GHcIOX_tXgxA', teamId: 'atletico-madrid' },
];

/** Solo entra lo que es una pieza de verdad. Los canales de club publican
 *  sobre todo Shorts y clips de relleno ("Ready!", "Good afternoon 👋").
 *  "goals" (sin la "e" de "gol") es TNT en inglés: "ALL GOALS in MD1...". */
const KEEP_RE =
  /rueda de prensa|press conference|\bresumen\b|highlights?|\bgol(es|azo|azos)?\b|\bgoals?\b|hat-?trick|entrevista|interview|\bprevia\b|match preview|minuto a minuto/i;

/** Ruido que se cuela aunque case KEEP_RE: Shorts/relleno propio, más
 *  cualquier competición que no sea la nuestra. Reutiliza OTHER_COMP_RE (el
 *  mismo filtro del buscador de resúmenes de partido) en vez de mantener una
 *  segunda lista aparte — "Liga F" se coló una vez precisamente por eso. */
const DROP_RE = new RegExp(
  `#shorts|\\bshorts\\b|femenin|women|juvenil|castilla|esports|e-?sports|fifa \\d|ea sports fc|${OTHER_COMP_RE.source}`,
  'i',
);

/** Contenido de PARTIDO (no rueda de prensa/entrevista/previa, que no suelen
 *  nombrar la competición en el título). Se usa para exigir, en los canales
 *  generales, que el título mencione LaLiga o Champions de verdad. */
const MATCH_CONTENT_RE = /\bresumen\b|highlights?|\bgol(es|azo|azos)?\b|\bgoals?\b|hat-?trick/i;

const MAX_AGE_H = 48;
const MAX_PER_RUN = 12;
const FIXTURE_MATCH_WINDOW_D = 10;

/**
 * Enlaza un vídeo de resumen con SU partido, si el título trae marcador
 * ("Barcelona 5 vs 1 Feyenoord") y el equipo ya se resolvió: así el detalle
 * de la noticia puede ofrecer "Ver estadísticas" del partido real, no solo
 * el vídeo. Heurística (no hay forma de saber si el marcador del título es
 * local-visitante o al revés) — se acepta cualquier orientación, acotado a
 * los partidos de ESE equipo de los últimos días.
 */
async function resolveFixtureForVideo(teamId: string | null, title: string): Promise<string | null> {
  if (!teamId) return null;
  const score = scoreInTitle(title);
  if (!score) return null;
  const [a, b] = score;

  const { data } = await db
    .from('fixtures')
    .select('id, home_team_id, home_score, away_score')
    .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
    .eq('status', 'FINISHED')
    .gte('kickoff_at', new Date(Date.now() - FIXTURE_MATCH_WINDOW_D * 24 * 3_600_000).toISOString())
    .order('kickoff_at', { ascending: false })
    .limit(5);

  const match = (data ?? []).find(
    (f) =>
      (f.home_score === a && f.away_score === b) || (f.home_score === b && f.away_score === a),
  );
  return match?.id ?? null;
}

export function syncVideoNews() {
  return withRun('syncVideoNews', 'news', async () => {
    const cutoff = Date.now() - MAX_AGE_H * 3_600_000;
    const rows: Record<string, unknown>[] = [];

    for (const ch of CHANNELS) {
      let entries: FeedEntry[] = [];
      try {
        entries = await getFeed(ch.channelId);
      } catch (err) {
        console.warn(`[syncVideoNews] feed de ${ch.name} falló`, err);
        continue;
      }

      for (const e of entries) {
        if (e.isShort) continue;
        if (!e.published || e.published < cutoff) continue;
        if (!KEEP_RE.test(e.title)) continue;
        if (DROP_RE.test(e.title)) continue;
        // LALIGA EA SPORTS / DAZN / TNT cubren TODA Europa, no solo lo
        // nuestro — un blocklist (DROP_RE/OTHER_COMP_RE) nunca está completo
        // (así se colaron Bundesliga e Hypermotion antes de añadirlas ahí).
        // En un canal general, un vídeo de PARTIDO tiene que nombrar LaLiga o
        // Champions de verdad. No aplica a rueda de prensa/entrevista/previa
        // (no suelen nombrar la competición) ni a los canales de club (su
        // contenido ya es de ese equipo por definición, salvo el filial, que
        // cubre `\brfef\b` arriba).
        if (!ch.teamId && MATCH_CONTENT_RE.test(e.title) && !LALIGA_RE.test(e.title) && !UCL_RE.test(e.title)) {
          continue;
        }

        // Equipo: el del canal si es de club, si no el que nombre el título.
        const teamId = ch.teamId ?? teamsMentioned(e.title)[0] ?? null;
        const url = `https://www.youtube.com/watch?v=${e.videoId}`;
        const fixtureId = await resolveFixtureForVideo(teamId, e.title);

        rows.push({
          title: e.title,
          summary: null,
          body: null,
          url,
          original_title: e.title,
          original_url: url,
          original_source: ch.name,
          original_author: ch.name,
          published_at: new Date(e.published).toISOString(),
          team_id: teamId,
          fixture_id: fixtureId,
          subject: null,
          topic: 'VIDEO',
          video_url: url,
          video_provider: 'youtube',
          image_url: e.thumbnail,
          // Ya tiene miniatura del proveedor: que resolveNewsImages no lo toque.
          image_state: 'resolved',
          // Sin paso por Groq: el titular del vídeo ya es la pieza.
          status: 'published',
        });
      }
    }

    if (!rows.length) return 0;
    rows.sort((a, b) => String(b.published_at).localeCompare(String(a.published_at)));
    const batch = rows.slice(0, MAX_PER_RUN);

    // `url` es unique desde 0001 → ignoreDuplicates deja pasar los ya vistos.
    const { data, error } = await db
      .from('news')
      .upsert(batch, { onConflict: 'url', ignoreDuplicates: true })
      .select('id');
    if (error) {
      console.error('[syncVideoNews] upsert falló', error);
      return 0;
    }

    const inserted = data?.length ?? 0;
    console.log(`[syncVideoNews] ${rows.length} candidatos, ${inserted} vídeos nuevos`);
    return inserted;
  });
}
