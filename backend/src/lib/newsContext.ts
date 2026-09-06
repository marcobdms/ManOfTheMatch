/**
 * Datos reales de Supabase que acompañan a cada noticia. El modelo solo puede
 * usar lo que salga de aquí: es lo que convierte un titular ajeno en una pieza
 * propia con ángulo ("qué significa esto para el equipo") en vez de un refrito.
 */
import { db } from '../db.js';
import { CURRENT_SEASON, type TeamId } from './shared.js';
import { TEAM_NAME } from './newsTaxonomy.js';

export type NewsContext = {
  equipo: string | null;
  clasificacion: { puesto: number; puntos: number | null; jugados: number | null; forma: string | null } | null;
  /** "3 victorias, 1 empate y 1 derrota" — el código crudo (WWDLW) el modelo lo copiaba literal. */
  forma_reciente: string | null;
  balance_goles: { a_favor: number | null; en_contra: number | null } | null;
  ultimos_partidos: string[];
  proximo_partido: { rival: string; donde: 'casa' | 'fuera'; cuando: string } | null;
  jugador: { nombre: string; partidos: number; goles: number; asistencias: number; nota_media: number | null } | null;
};

/** "WWDLW" -> "3 victorias, 1 empate y 1 derrota". */
function describeForm(form: string | null): string | null {
  if (!form) return null;
  const letters = form.toUpperCase().replace(/[^WDL]/g, '');
  if (!letters) return null;
  const w = [...letters].filter((l) => l === 'W').length;
  const d = [...letters].filter((l) => l === 'D').length;
  const l = [...letters].filter((l) => l === 'L').length;
  const parts: string[] = [];
  if (w) parts.push(`${w} ${w === 1 ? 'victoria' : 'victorias'}`);
  if (d) parts.push(`${d} ${d === 1 ? 'empate' : 'empates'}`);
  if (l) parts.push(`${l} ${l === 1 ? 'derrota' : 'derrotas'}`);
  if (!parts.length) return null;
  return parts.length === 1 ? parts[0]! : `${parts.slice(0, -1).join(', ')} y ${parts.at(-1)}`;
}

function resultLabel(gf: number, ga: number): string {
  if (gf > ga) return 'victoria';
  if (gf < ga) return 'derrota';
  return 'empate';
}

export async function buildNewsContext(
  teamId: TeamId | null,
  subject: string | null,
): Promise<NewsContext> {
  const ctx: NewsContext = {
    equipo: teamId ? TEAM_NAME[teamId] : null,
    clasificacion: null,
    forma_reciente: null,
    balance_goles: null,
    ultimos_partidos: [],
    proximo_partido: null,
    jugador: null,
  };
  if (!teamId) return ctx;

  // Solo la de LaLiga: un equipo en Champions tiene también filas de esa
  // competición y a veces con captured_at más reciente pero sin poblar
  // (pretemporada: J0, 0 puntos). Y aun dentro de LaLiga, se descarta una
  // captura con jugados=0 — es un placeholder, no una clasificación real.
  const { data: st } = await db
    .from('standings')
    .select('position, points, played, form, goals_for, goals_against')
    .eq('team_id', teamId)
    .eq('season_id', CURRENT_SEASON)
    .eq('competition_id', 'laliga')
    .order('captured_at', { ascending: false })
    .limit(1);
  const row = st?.[0] as
    | { position: number; points: number | null; played: number | null; form: string | null; goals_for: number | null; goals_against: number | null }
    | undefined;
  if (row && (row.played ?? 0) > 0) {
    ctx.clasificacion = { puesto: row.position, puntos: row.points, jugados: row.played, forma: null };
    ctx.forma_reciente = describeForm(row.form);
    ctx.balance_goles = { a_favor: row.goals_for, en_contra: row.goals_against };
  }

  const { data: played } = await db
    .from('fixtures')
    .select('home_team_id, away_team_id, home_score, away_score, kickoff_at')
    .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
    .eq('status', 'FINISHED')
    .order('kickoff_at', { ascending: false })
    .limit(5);
  for (const f of (played ?? []) as Array<{
    home_team_id: string | null; away_team_id: string | null;
    home_score: number | null; away_score: number | null;
  }>) {
    if (f.home_score == null || f.away_score == null) continue;
    const isHome = f.home_team_id === teamId;
    const rivalId = (isHome ? f.away_team_id : f.home_team_id) as TeamId | null;
    const gf = isHome ? f.home_score : f.away_score;
    const ga = isHome ? f.away_score : f.home_score;
    ctx.ultimos_partidos.push(
      `${resultLabel(gf, ga)} ${gf}-${ga} ${isHome ? 'en casa' : 'fuera'} contra ${rivalId ? TEAM_NAME[rivalId] ?? rivalId : 'rival'}`,
    );
  }

  const { data: next } = await db
    .from('fixtures')
    .select('home_team_id, away_team_id, kickoff_at')
    .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
    .eq('status', 'SCHEDULED')
    .gte('kickoff_at', new Date().toISOString())
    .order('kickoff_at', { ascending: true })
    .limit(1);
  const nf = next?.[0] as { home_team_id: string | null; away_team_id: string | null; kickoff_at: string } | undefined;
  if (nf) {
    const isHome = nf.home_team_id === teamId;
    const rivalId = (isHome ? nf.away_team_id : nf.home_team_id) as TeamId | null;
    ctx.proximo_partido = {
      rival: rivalId ? TEAM_NAME[rivalId] ?? rivalId : 'rival',
      donde: isHome ? 'casa' : 'fuera',
      cuando: new Intl.DateTimeFormat('es-ES', {
        weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
        timeZone: 'Europe/Madrid',
      }).format(new Date(nf.kickoff_at)),
    };
  }

  // Stats del protagonista, solo si es jugador de ese equipo y ya ha jugado.
  if (subject) {
    const { data: ps } = await db
      .from('player_match_stats')
      .select('player_name, goals, assists, rating')
      .eq('team_id', teamId)
      .ilike('player_name', `%${subject.split(' ').pop() ?? subject}%`)
      .limit(40);
    const rows = (ps ?? []) as Array<{ player_name: string; goals: number | null; assists: number | null; rating: number | null }>;
    if (rows.length) {
      const ratings = rows.map((r) => r.rating).filter((r): r is number => typeof r === 'number');
      ctx.jugador = {
        nombre: rows[0]!.player_name,
        partidos: rows.length,
        goles: rows.reduce((a, r) => a + (r.goals ?? 0), 0),
        asistencias: rows.reduce((a, r) => a + (r.assists ?? 0), 0),
        nota_media: ratings.length ? Number((ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(2)) : null,
      };
    }
  }

  return ctx;
}
