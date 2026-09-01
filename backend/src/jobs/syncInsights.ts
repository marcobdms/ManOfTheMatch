// Momentos comentados del partido: detecta patrones reales (asedio, paradón,
// racha de remates sin premio, posesión aplastante, remontada) y los escribe
// en `match_events` como tipo INSIGHT, para que salgan en el histórico junto
// al resto de eventos, en su minuto.
//
// Corre sobre partidos ya terminados y solo una vez por partido: los patrones
// se calculan sobre el partido completo, no tienen sentido a medias.
import { db } from '../db.js';
import { withRun } from '../lib/run.js';
import { teamName } from '../lib/ids.js';
import { detectInsights, type InsightInput, type MatchInsight } from '../lib/matchInsights.js';
import { INSIGHT_LABEL, phraseFor } from '../lib/insightPhrases.js';
import { flavorInsight } from '../lib/narrate.js';

const SOURCE = 'insight';
/** Tope por pasada: cada partido son varias lecturas + alguna llamada a Groq. */
const MATCHES_PER_RUN = 3;
/** Solo estos tipos pasan por Groq — son los "de patrón", donde una frase con
 *  chispa aporta. Los demás se quedan con su plantilla, que ya suena bien. */
const FLAVORED: ReadonlySet<string> = new Set(['siege', 'possession_half', 'comeback']);

type FixtureRow = {
  id: string;
  home_team_id: string | null;
  away_team_id: string | null;
  kickoff_at: string;
};

export function syncInsights() {
  return withRun('syncInsights', 'derived', async () => {
    const { data } = await db
      .from('fixtures')
      .select('id, home_team_id, away_team_id, kickoff_at')
      .eq('status', 'FINISHED')
      .order('kickoff_at', { ascending: false })
      .limit(60);

    const fixtures = (data ?? []) as unknown as FixtureRow[];
    if (!fixtures.length) return 0;

    // Los que ya tienen momentos escritos se saltan: esto no se recalcula.
    const { data: existing } = await db
      .from('match_events')
      .select('fixture_id')
      .eq('source', SOURCE)
      .in('fixture_id', fixtures.map((f) => f.id));
    const done = new Set((existing ?? []).map((r: { fixture_id: string }) => r.fixture_id));

    const pending = fixtures.filter((f) => !done.has(f.id)).slice(0, MATCHES_PER_RUN);
    if (!pending.length) return 0;

    let written = 0;
    for (const f of pending) {
      try {
        written += await syncOne(f);
      } catch (err) {
        console.error(`[syncInsights] ${f.id} falló`, err);
      }
    }
    return written;
  });
}

async function syncOne(f: FixtureRow): Promise<number> {
  const [momentumRes, shotsRes, goalsRes, statsRes] = await Promise.all([
    db.from('match_momentum').select('minute, value').eq('fixture_id', f.id),
    db
      .from('match_shots')
      .select('minute, team_id, player_name, event_type, expected_goals')
      .eq('fixture_id', f.id),
    db
      .from('match_events')
      .select('minute, team_id, type')
      .eq('fixture_id', f.id)
      .in('type', ['GOAL', 'PENALTY_GOAL', 'OWN_GOAL']),
    db
      .from('match_team_stats')
      .select('home_value, away_value')
      .eq('fixture_id', f.id)
      .eq('period', 'FirstHalf')
      .eq('stat_key', 'BallPossesion')
      .maybeSingle(),
  ]);

  const input: InsightInput = {
    homeTeamId: f.home_team_id,
    awayTeamId: f.away_team_id,
    momentum: (momentumRes.data ?? []).map((m: { minute: number; value: number }) => ({
      minute: m.minute,
      value: m.value,
    })),
    shots: (shotsRes.data ?? []).map(
      (s: {
        minute: number | null;
        team_id: string | null;
        player_name: string | null;
        event_type: string;
        expected_goals: number | null;
      }) => ({
        minute: s.minute,
        teamId: s.team_id,
        playerName: s.player_name,
        eventType: s.event_type,
        expectedGoals: s.expected_goals,
      }),
    ),
    goals: (goalsRes.data ?? []).map((g: { minute: number | null; team_id: string | null }) => ({
      minute: g.minute,
      teamId: g.team_id,
    })),
    firstHalfPossession: parsePossession(statsRes.data),
  };

  // Sin momentum ni disparos no hay nada que detectar — y escribir cero
  // momentos dejaría el partido marcado como hecho sin estarlo, así que se
  // sale sin tocar nada y se reintenta en otra pasada.
  if (!input.momentum.length && !input.shots.length) return 0;

  const insights = detectInsights(input);
  if (!insights.length) return 0;

  const rows = [];
  for (const [i, insight] of insights.entries()) {
    const text = await phrase(insight, f, i);
    if (!text) continue;
    rows.push({
      fixture_id: f.id,
      type: 'INSIGHT',
      minute: insight.minute,
      team_id: insight.teamId,
      detail: INSIGHT_LABEL[insight.kind],
      narration: text,
      // Estable: si el job se repitiera, actualiza en vez de duplicar.
      source: SOURCE,
      source_event_id: `${insight.kind}:${insight.minute}`,
      sort_key: insight.minute,
    });
  }
  if (!rows.length) return 0;

  const { error } = await db
    .from('match_events')
    .upsert(rows, { onConflict: 'fixture_id,source,source_event_id' });
  if (error) throw new Error(`match_events(insight): ${error.message}`);
  return rows.length;
}

/** "68" o "68 (90%)" → número. La comparativa guarda todo como texto. */
function parsePossession(row: { home_value: string | null; away_value: string | null } | null): [number, number] | null {
  if (!row) return null;
  const num = (raw: string | null) => {
    const m = raw?.match(/\d+(?:[.,]\d+)?/);
    return m ? Number(m[0].replace(',', '.')) : null;
  };
  const home = num(row.home_value);
  const away = num(row.away_value);
  return home != null && away != null ? [home, away] : null;
}

async function phrase(insight: MatchInsight, f: FixtureRow, index: number): Promise<string | null> {
  const team = teamName(insight.teamId);
  const rivalId = insight.teamId === f.home_team_id ? f.away_team_id : f.home_team_id;
  const opponent = teamName(rivalId);
  if (!team || !opponent) return null; // rival no seguido: sin nombre fiable no se comenta

  // La semilla mezcla partido, tipo y minuto: la misma situación siempre elige
  // la misma plantilla, pero dos partidos distintos no suenan igual.
  const seed = hash(`${f.id}:${insight.kind}:${insight.minute}`) + index;
  const base = phraseFor(insight, team, opponent, seed);

  if (!FLAVORED.has(insight.kind)) return base;
  const flavored = await flavorInsight(base, {
    momento: INSIGHT_LABEL[insight.kind],
    equipo: team,
    rival: opponent,
    minuto: insight.minute,
    ...insight.facts,
  });
  return flavored ?? base;
}

function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return h;
}
