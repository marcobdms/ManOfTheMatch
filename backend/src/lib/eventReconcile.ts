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
 *   - si no era gol (sustitución, tarjeta...), se borra sin más.
 */
export async function reconcileRetracted(fixtureId: string, source: string, validIds: string[]): Promise<void> {
  const { data: existing, error: selError } = await db
    .from('match_events')
    .select('id, type, source_event_id, team_id, player_name, minute')
    .eq('fixture_id', fixtureId)
    .eq('source', source);
  if (selError) {
    console.warn(`[reconcile] select falló para ${fixtureId}/${source}`, selError);
    return;
  }

  const validSet = new Set(validIds);
  const gone = (existing ?? []).filter((r) => !validSet.has(r.source_event_id));
  if (!gone.length) return;

  const toVar = gone.filter((r) => GOAL_TYPES.has(r.type));
  const toDelete = gone.filter((r) => !GOAL_TYPES.has(r.type)).map((r) => r.id);

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
    .select('home_team_id, away_team_id, home_score, away_score')
    .eq('id', fixtureId)
    .maybeSingle();
  if (!fx) return;

  for (const r of rows) {
    const isHome = r.team_id === fx.home_team_id;
    const team = teamName(r.team_id);
    const opponent = teamName(isHome ? fx.away_team_id : fx.home_team_id);
    if (!team || !opponent) continue; // rival no seguido (Champions) — sin nombre fiable, no se narra

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
