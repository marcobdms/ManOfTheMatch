import { db } from '../db.js';

const SOURCE_PRIORITY = ['fotmob', 'espn', 'theSportsDb', 'apiFootball'];

/** Misma huella que eventReconcile.ts: une la fila del gol original con su
 *  fila 'VAR' de anulación (son dos filas distintas — ver eventReconcile.ts). */
function eventFingerprint(r: { team_id: string | null; minute: number | null; player_name: string | null }): string {
  return `${r.team_id ?? ''}|${r.minute ?? ''}|${(r.player_name ?? '').trim().toLowerCase()}`;
}

/**
 * Marcador "de verdad" de un partido cuando ha habido un GOL ANULADO por VAR.
 *
 * football-data / TheSportsDB / ESPN funcionan con "el marcador nunca baja",
 * así que un gol anulado se les queda pegado (bug real: 4-1 cuando iba 4-0).
 * La fila del gol NUNCA cambia de tipo (eventReconcile.ts la deja intacta
 * para que su narración no desaparezca) — aquí se descarta por huella
 * (equipo+minuto+jugador) contra las filas 'VAR' que sí son nuevas.
 *
 * Devuelve el conteo real SOLO si en la mejor fuente disponible hay algún gol
 * anulado; en un partido normal devuelve `null` y no se toca nada (el marcador
 * lo llevan las fuentes rápidas). Así nunca se "baja" un gol legítimo porque
 * una fuente vaya un poco por detrás.
 */
export async function correctedScore(
  fixtureId: string,
  homeTeamId: string | null,
): Promise<{ home: number; away: number } | null> {
  const { data } = await db
    .from('match_events')
    .select('team_id, type, source, minute, player_name')
    .eq('fixture_id', fixtureId)
    .in('type', ['GOAL', 'PENALTY_GOAL', 'OWN_GOAL', 'VAR']);
  if (!data || !data.length) return null;

  const rows = data as Array<{
    team_id: string | null;
    type: string;
    source: string | null;
    minute: number | null;
    player_name: string | null;
  }>;
  const source = SOURCE_PRIORITY.find((s) => rows.some((r) => r.source === s));
  const chosen = source ? rows.filter((r) => r.source === source) : rows;

  const varRows = chosen.filter((r) => r.type === 'VAR');
  if (!varRows.length) return null;
  const voidedFingerprints = new Set(varRows.map(eventFingerprint));

  let home = 0;
  let away = 0;
  for (const r of chosen) {
    if (r.type === 'VAR' || !r.team_id) continue;
    if (voidedFingerprints.has(eventFingerprint(r))) continue; // el gol anulado no cuenta
    const forHome = r.type === 'OWN_GOAL' ? r.team_id !== homeTeamId : r.team_id === homeTeamId;
    if (forHome) home++;
    else away++;
  }
  return { home, away };
}
