/**
 * Ingesta de noticias: lee los feeds de Marca y AS, se queda con lo que
 * encaja en la taxonomía y lo guarda como `draft`. Barato — aquí no se llama
 * a Groq. La reescritura va aparte (jobs/rewriteNews.ts) para que un fallo
 * del modelo no arrastre a la ingesta ni al revés.
 */
import { db } from '../db.js';
import { withRun } from '../lib/run.js';
import { fetchAllNews } from '../sources/marcaRss.js';
import { fetchAsNews } from '../sources/asRss.js';
import {
  classifyFeedItem,
  subjectFromCategories,
  teamFromItem,
  teamsMentioned,
} from '../lib/newsTaxonomy.js';
import type { TeamId } from '../lib/shared.js';

/** Forma común para no repetir el bucle de abajo por cada medio. */
type FeedItem = {
  title: string;
  link: string;
  summary: string | null;
  author: string | null;
  publishedAt: string | null;
  categories: string[];
  feedTeamId: TeamId | null;
  source: 'Marca' | 'AS';
};

/** Los feeds de equipo guardan ~45 items, que pueden ser de hace semanas.
 *  Una noticia vieja ya no interesa y gastaría una llamada a Groq igual. */
const MAX_AGE_DAYS = 3;
/** Techo por pasada: la primera vez el feed trae cientos acumulados. */
const MAX_DRAFTS_PER_RUN = 40;

export function syncNews() {
  return withRun('syncNews', 'news', async () => {
    const [marca, as] = await Promise.all([fetchAllNews(), fetchAsNews()]);
    const items: FeedItem[] = [
      ...marca.map((it) => ({ ...it, source: 'Marca' as const })),
      ...as.map((it) => ({ ...it, feedTeamId: null, source: 'AS' as const })),
    ];
    if (!items.length) return 0;

    // Partidos programados de los próximos 12 días: si un titular nombra a los
    // DOS equipos de uno de ellos, la noticia es de ESE enfrentamiento y en el
    // front se pinta con los dos escudos (previa de partido).
    const { data: fxRows } = await db
      .from('fixtures')
      .select('id, home_team_id, away_team_id')
      .eq('status', 'SCHEDULED')
      .gte('kickoff_at', new Date().toISOString())
      .lte('kickoff_at', new Date(Date.now() + 12 * 24 * 3600_000).toISOString());
    const upcoming = (fxRows ?? []) as Array<{
      id: string;
      home_team_id: string | null;
      away_team_id: string | null;
    }>;
    const fixtureForPair = (a: string, b: string): string | null =>
      upcoming.find(
        (f) =>
          (f.home_team_id === a && f.away_team_id === b) ||
          (f.home_team_id === b && f.away_team_id === a),
      )?.id ?? null;

    const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 3600_000;
    const candidates = [];

    for (const it of items) {
      const topic = classifyFeedItem(it.title, it.summary);
      if (!topic) continue;
      const published = it.publishedAt ? Date.parse(it.publishedAt) : NaN;
      if (!Number.isFinite(published) || published < cutoff) continue;

      const [teamA, teamB] = teamsMentioned(it.title);
      const fixtureId = teamA && teamB ? fixtureForPair(teamA, teamB) : null;

      candidates.push({
        topic,
        published,
        fixtureId,
        row: {
          // Mientras es draft esto guarda el original (la RLS de 0017 no deja
          // salir un draft); al reescribir, ambos se sustituyen por lo nuestro.
          title: it.title,
          summary: it.summary,
          url: it.link,
          original_title: it.title,
          original_url: it.link,
          original_source: it.source,
          original_author: it.author,
          published_at: it.publishedAt,
          team_id: teamFromItem(it.categories, it.feedTeamId),
          subject: subjectFromCategories(it.categories, it.title),
          fixture_id: fixtureId,
          topic,
          status: 'draft',
          image_state: 'pending',
        },
      });
    }

    // Las más recientes primero: si hay que recortar, que caiga lo viejo.
    candidates.sort((a, b) => b.published - a.published);

    // Dos medios pueden cubrir EL MISMO partido con el mismo ángulo (previa,
    // alineaciones...) — se queda solo el primero (el más reciente, tras el
    // sort de arriba) para no publicar la misma historia dos veces.
    const seenMatchTopic = new Set<string>();
    const deduped = candidates.filter((c) => {
      if (!c.fixtureId) return true;
      const key = `${c.fixtureId}:${c.topic}`;
      if (seenMatchTopic.has(key)) return false;
      seenMatchTopic.add(key);
      return true;
    });

    const batch = deduped.slice(0, MAX_DRAFTS_PER_RUN);
    if (!batch.length) return 0;

    // `url` es unique desde 0001 → ignoreDuplicates deja pasar las ya vistas
    // sin pisar una pieza ya reescrita.
    const { data, error } = await db
      .from('news')
      .upsert(
        batch.map((c) => c.row),
        { onConflict: 'url', ignoreDuplicates: true },
      )
      .select('id');

    if (error) {
      console.error('[syncNews] upsert falló', error);
      return 0;
    }

    const inserted = data?.length ?? 0;
    console.log(
      `[syncNews] ${marca.length} Marca + ${as.length} AS leídas, ${candidates.length} encajan ` +
        `(${candidates.length - deduped.length} fusionadas por duplicado), ${inserted} nuevas`,
    );
    return inserted;
  });
}
