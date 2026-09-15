import { db } from '../db.js';
import { teamName } from './ids.js';
import { narrateEvent } from './narrate.js';
import { correctedScore } from './liveScore.js';

const GOAL_TYPES = new Set(['GOAL', 'OWN_GOAL', 'PENALTY_GOAL']);

/** Identifica el MISMO gol entre su fila original y la fila de anulación:
 *  no hay otra clave que las una (la de anulación es una fila nueva, con su
 *  propio `source_event_id`). */
function eventFingerprint(r: { team_id: string | null; minute: number | null; player_name: string | null }): string {
  return `${r.team_id ?? ''}|${r.minute ?? ''}|${(r.player_name ?? '').trim().toLowerCase()}`;
}

/**
 * Fotmob/ESPN mandan el estado ACTUAL del partido en cada poll, no un log que
 * solo crece — un gol anulado por VAR desaparece de esa lista en un poll
 * posterior. Antes solo hacíamos upsert, así que la fila vieja se quedaba
 * para siempre (visto en real: "GOL del Getafe — <TBD>" que el marcador
 * final nunca contó). Lo que ya no está en `validIds`:
 *   - si era gol, se AÑADE una fila NUEVA de tipo 'VAR' (detail 'Gol
 *     anulado', narrada aparte) — la fila del gol original NO se toca: tipo
 *     y narración se quedan tal cual, así el "GOL de X" no desaparece del
 *     histórico solo porque el VAR lo anule un minuto después. Dos hechos,
 *     dos líneas.
 *   - si el gol YA tiene su fila 'VAR' gemela (mismo equipo+minuto+jugador,
 *     de un poll anterior), no se reprocesa — si no, cada poll insertaría
 *     otra fila de anulación para el mismo gol.
 *   - si no era gol (sustitución, tarjeta...), se borra sin más.
 */
export async function reconcileRetracted(fixtureId: string, source: string, validIds: string[]): Promise<void> {
  const { data: existing, error: selError } = await db
    .from('match_events')
    .select('id, type, source_event_id, team_id, player_name, minute, narration, sort_key')
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

  const voidedFingerprints = new Set((existing ?? []).filter((r) => r.type === 'VAR').map(eventFingerprint));

  const toVar = gone.filter((r) => GOAL_TYPES.has(r.type) && !voidedFingerprints.has(eventFingerprint(r)));
  const toDelete = gone.filter((r) => !GOAL_TYPES.has(r.type) && r.type !== 'VAR').map((r) => r.id);

  if (toVar.length) {
    const varRows = toVar.map((r) => ({
      fixture_id: fixtureId,
      source,
      source_event_id: `${r.source_event_id}:var`,
      type: 'VAR',
      detail: 'Gol anulado',
      team_id: r.team_id,
      player_name: r.player_name,
      minute: r.minute,
      // Justo después del gol original en el orden del histórico (mismo
      // minuto): sin esto el sort_key por defecto (0) la podía colar ANTES.
      sort_key: (r.sort_key ?? 0) + 1,
    }));
    const { data: inserted, error } = await db
      .from('match_events')
      .insert(varRows)
      .select('id, team_id, player_name, minute');
    if (error) console.warn(`[reconcile] insertar anulación falló para ${fixtureId}/${source}`, error);
    else {
      await narrateDisallowed(fixtureId, inserted ?? []);
      // El gol anulado ya no cuenta: baja el marcador de la card al instante,
      // sin esperar a que football-data se dé por enterado (a veces no lo hace).
      if (source === 'fotmob') await correctScoreAfterDisallow(fixtureId);
    }
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


/** Fija el marcador al conteo de goles de Fotmob tras anular uno (LIVE/PAUSED). */
async function correctScoreAfterDisallow(fixtureId: string): Promise<void> {
  const { data: fx } = await db
    .from('fixtures')
    .select('home_team_id, home_score, away_score, status')
    .eq('id', fixtureId)
    .maybeSingle();
  if (!fx || (fx.status !== 'LIVE' && fx.status !== 'PAUSED')) return;
  const sc = await correctedScore(fixtureId, fx.home_team_id);
  if (!sc || (fx.home_score === sc.home && fx.away_score === sc.away)) return;
  await db.from('fixtures').update({ home_score: sc.home, away_score: sc.away }).eq('id', fixtureId);
}
