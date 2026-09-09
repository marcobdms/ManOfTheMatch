import { db } from '../db.js';
import { teamName } from './ids.js';
import { narrateEvent } from './narrate.js';

const GOAL_TYPES = new Set(['GOAL', 'OWN_GOAL', 'PENALTY_GOAL']);

/**
 * Fotmob/ESPN mandan el estado ACTUAL del partido en cada poll, no un log que
 * solo crece — un gol anulado por VAR desaparece de esa lista en un poll
 * posterior. Antes solo hacíamos upsert, así que la fila vieja se quedaba
 * para siempre (visto en real: "GOL del Getafe — <TBD>" que el marcador
 * final nunca contó). Lo que ya no está en `validIds`:
 *   - si era gol, se RE-TIPIFICA a 'VAR' con detail 'Gol anulado' (y se narra
 *     una vez, igual que un gol normal) — se conserva el momento en vez de
 *     borrarlo sin dejar rastro.
 *   - si ya era 'VAR' (gol anulado que reconciliamos en un poll anterior), se
 *     DEJA — es un hecho histórico, Fotmob nunca lo vuelve a listar y borrarlo
 *     tiraba la narración "el VAR lo anula" que ya se había guardado.
 *   - si no era gol (sustitución, tarjeta...), se borra sin más.
 */
export async function reconcileRetracted(fixtureId: string, source: string, validIds: string[]): Promise<void> {
  const { data: existing, error: selError } = await db
    .from('match_events')
    .select('id, type, source_event_id, team_id, player_name, minute, narration')
    .eq('fixture_id', fixtureId)
    .eq('source', source);
  if (selError) {
    console.warn(`[reconcile] select falló para ${fixtureId}/${source}`, selError);
    return;
  }

  // Goles anulados que se quedaron sin frase (Groq falló en su tick): se
  // reintenta aquí, es barato y el "el VAR lo anula" es el detalle que se
  // quiere que nunca falte.
  const unnarratedVar = (existing ?? []).filter((r) => r.type === 'VAR' && !r.narration);
  if (unnarratedVar.length) await narrateDisallowed(fixtureId, unnarratedVar);

  const validSet = new Set(validIds);
  const gone = (existing ?? []).filter((r) => !validSet.has(r.source_event_id));
  if (!gone.length) return;

  const toVar = gone.filter((r) => GOAL_TYPES.has(r.type));
  // 'VAR' fuera del borrado: ya se reconció una vez y es permanente.
  const toDelete = gone
    .filter((r) => !GOAL_TYPES.has(r.type) && r.type !== 'VAR')
    .map((r) => r.id);

  if (toVar.length) {
    const { error } = await db
      .from('match_events')
      .update({ type: 'VAR', detail: 'Gol anulado' })
      .in('id', toVar.map((r) => r.id));
    if (error) console.warn(`[reconcile] re-tipificar falló para ${fixtureId}/${source}`, error);
    else await narrateDisallowed(fixtureId, toVar);
  }
  if (toDelete.length) {
    const { error } = await db.from('match_events').delete().in('id', toDelete);
    if (error) console.warn(`[reconcile] borrar falló para ${fixtureId}/${source}`, error);
  }
}

async function narrateDisallowed(
  fixtureId: string,
  rows: Array<{ id: string; team_id: string | null; player_name: string | null; minute: number | null }>,
): Promise<void> {
  const { data: fx } = await db
    .from('fixtures')
    .select('home_team_id, away_team_id, home_score, away_score, home_team_name, away_team_name')
    .eq('id', fixtureId)
    .maybeSingle();
  if (!fx) return;

  for (const r of rows) {
    const isHome = r.team_id === fx.home_team_id;
    // Champions: sin slug seguido, se cae al nombre inline del fixture.
    const team = teamName(r.team_id) ?? (isHome ? fx.home_team_name : fx.away_team_name)?.trim() ?? null;
    const opponent =
      teamName(isHome ? fx.away_team_id : fx.home_team_id) ??
      (isHome ? fx.away_team_name : fx.home_team_name)?.trim() ??
      null;
    if (!team || !opponent) continue;

    const narration = await narrateEvent({
      kind: 'disallowed_goal',
      minute: r.minute,
      team,
      opponent,
      player: r.player_name,
      homeScore: fx.home_score ?? 0,
      awayScore: fx.away_score ?? 0,
    });
    if (narration) {
      await db.from('match_events').update({ narration }).eq('id', r.id);
    }
  }
}
