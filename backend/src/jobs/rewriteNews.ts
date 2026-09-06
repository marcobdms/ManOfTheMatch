/**
 * Convierte drafts en piezas publicables: una llamada a Groq por noticia, una
 * sola vez. El resultado queda en `news` y lo leen todos los usuarios — el
 * gasto escala con noticias/día, nunca con tráfico.
 *
 * Pocas por pasada a propósito: el límite que muerde en el free tier no es el
 * diario sino los 6.000 tokens/minuto, y cada pieza gasta ~1.400.
 */
import { db } from '../db.js';
import { withRun } from '../lib/run.js';
import { newsHasBudget } from '../lib/budget.js';
import { buildNewsContext } from '../lib/newsContext.js';
import { writeNewsPiece, GROQ_NEWS_MODEL } from '../lib/newsWriter.js';
import type { NewsTopic } from '../lib/newsTaxonomy.js';
import type { TeamId } from '../lib/shared.js';

const PER_RUN = 3;

type DraftRow = {
  id: string;
  original_title: string;
  summary: string | null;
  topic: NewsTopic;
  subject: string | null;
  team_id: string | null;
};

export function rewriteNews() {
  return withRun('rewriteNews', 'groq-news', async () => {
    if (!process.env.GROQ_API_KEY) {
      console.warn('[rewriteNews] sin GROQ_API_KEY — nada que hacer');
      return 0;
    }
    if (!(await newsHasBudget(PER_RUN))) {
      console.log('[rewriteNews] presupuesto diario agotado');
      return 0;
    }

    const { data } = await db
      .from('news')
      .select('id, original_title, summary, topic, subject, team_id')
      .eq('status', 'draft')
      .not('topic', 'is', null)
      .order('published_at', { ascending: false })
      .limit(PER_RUN);

    const drafts = (data ?? []) as unknown as DraftRow[];
    if (!drafts.length) return 0;

    let written = 0;
    for (const d of drafts) {
      try {
        const context = await buildNewsContext((d.team_id as TeamId | null) ?? null, d.subject);
        const piece = await writeNewsPiece({
          originalTitle: d.original_title,
          originalSummary: d.summary,
          topicHint: d.topic,
          subject: d.subject,
          context,
        });

        if (!piece) {
          // Se deja en draft: la siguiente pasada lo reintenta. Si el fallo es
          // permanente lo recogerá el barrido de abajo.
          console.warn(`[rewriteNews] ${d.id} sin pieza`);
          continue;
        }

        await db
          .from('news')
          .update({
            title: piece.title,
            summary: piece.body,
            body: piece.body,
            topic: piece.topic,
            status: 'published',
            model: GROQ_NEWS_MODEL,
            rewritten_at: new Date().toISOString(),
          })
          .eq('id', d.id);
        written++;
      } catch (err) {
        console.error(`[rewriteNews] ${d.id} falló`, err);
      }
    }

    return written;
  });
}

/** Drafts que llevan más de un día sin poder reescribirse: se marcan para no
 *  reintentarlos indefinidamente ni bloquear la cola por recencia. */
export function pruneStaleDrafts() {
  return withRun('pruneStaleDrafts', 'news', async () => {
    const cutoff = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { data } = await db
      .from('news')
      .update({ status: 'skipped' })
      .eq('status', 'draft')
      .lt('created_at', cutoff)
      .select('id');
    return data?.length ?? 0;
  });
}
