import { db } from '../db.js';

type LineupRowInput = {
  fixture_id: string;
  team_id: string;
  source: 'fotmob' | 'apiFootball';
  captured_at: string;
} & Record<string, unknown>;

/**
 * Guarda la alineación de un partido y borra lo que ya no está en ella. El
 * upsert por (fixture, team, player_name, is_starting) solo añade/actualiza:
 * un jugador del XI *previsto* que al final fue suplente, o que pasó de
 * titular a banquillo, se quedaba como fila de "titular" para siempre y la
 * vista pintaba 12+ jugadores. Solo se limpia la MISMA fuente — las filas de
 * API-Football sirven a runDueMatchDetails para no volver a gastar cuota.
 */
export async function saveFixtureLineup(rows: LineupRowInput[], label: string): Promise<void> {
  if (!rows.length) return;
  const { error } = await db
    .from('lineups')
    .upsert(rows, { onConflict: 'fixture_id,team_id,player_name,is_starting' });
  if (error) {
    console.warn(`[lineups] ${label} no se guardó`, error);
    return;
  }

  const groups = new Map<string, LineupRowInput>();
  for (const r of rows) groups.set(`${r.team_id}|${r.source}`, r);
  for (const r of groups.values()) {
    const { error: delError } = await db
      .from('lineups')
      .delete()
      .eq('fixture_id', r.fixture_id)
      .eq('team_id', r.team_id)
      .eq('source', r.source)
      .lt('captured_at', r.captured_at);
    if (delError) console.warn(`[lineups] ${label}: limpieza de ${r.team_id} falló`, delError);
  }
}
