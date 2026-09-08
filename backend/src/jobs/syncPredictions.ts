// Previsiones pre-partido: cuotas (API-Football, 3 casas) + pronostico +
// argumentos de Fotmob. Ventana ampliada de 36h a 4 dias (verificado en vivo
// contra la API real: odds+predictions ya estan completos con 11-12 casas
// hasta ~164h antes del kickoff, el limite real no es la disponibilidad del
// dato sino nuestro presupuesto diario de 75 llamadas — ver budget.ts). Para
// no reventar ese presupuesto con toda una jornada a la vez, el refresco es
// escalonado: cada 6h si falta menos de 36h (las cuotas se mueven cerca del
// partido), cada 24h si falta mas (con eso sobra, casi no cambian).
import { db } from '../db.js';
import { withRun } from '../lib/run.js';
import { apiFootballHasBudget } from '../lib/budget.js';
import { getOdds, getPredictions } from '../sources/apiFootball.js';
import { getMatchDetails } from '../sources/fotmob.js';

const WINDOW_H = 96;
const REFRESH_SOON_H = 6; // faltando <36h
const REFRESH_FAR_H = 24; // faltando 36h-96h
const NEAR_CUTOFF_H = 36;
const BOOKMAKERS = [
  { id: 8, name: 'Bet365' },
  { id: 7, name: 'William Hill' },
  { id: 3, name: 'Betfair' },
];

type FixtureRow = {
  id: string;
  kickoff_at: string;
  source_ids: Record<string, unknown> | null;
  predictions_synced_at: string | null;
};

export function syncPredictions() {
  return withRun('syncPredictions', 'api-football', async () => {
    const windowEnd = new Date(Date.now() + WINDOW_H * 3_600_000).toISOString();
    const { data } = await db
      .from('fixtures')
      .select('id, kickoff_at, source_ids, predictions_synced_at')
      .eq('status', 'SCHEDULED')
      .lte('kickoff_at', windowEnd);

    const due = ((data ?? []) as unknown as FixtureRow[]).filter((f) => {
      if (!f.predictions_synced_at) return true;
      const hoursOut = (new Date(f.kickoff_at).getTime() - Date.now()) / 3_600_000;
      const refreshAfterH = hoursOut <= NEAR_CUTOFF_H ? REFRESH_SOON_H : REFRESH_FAR_H;
      return Date.now() - new Date(f.predictions_synced_at).getTime() > refreshAfterH * 3_600_000;
    });
    if (!due.length) return 0;
    if (!(await apiFootballHasBudget(due.length * 2))) return 0;

    let calls = 0;
    for (const f of due) {
      try {
        const afId = f.source_ids?.apiFootball;
        if (afId == null) continue;
        calls += await syncOne(f, Number(afId));
      } catch (err) {
        console.error(`[syncPredictions] ${f.id} falló`, err);
      }
    }
    return calls;
  });
}

async function syncOne(f: FixtureRow, afId: number): Promise<number> {
  let calls = 0;
  const [odds, predictions] = await Promise.all([
    getOdds(afId).then((r) => {
      calls++;
      return r;
    }),
    getPredictions(afId).then((r) => {
      calls++;
      return r;
    }),
  ]);

  const oddsRow = odds[0];
  if (oddsRow) {
    const rows = BOOKMAKERS.map(({ id, name }) => {
      const bm = oddsRow.bookmakers?.find((b) => b.id === id);
      const bet = bm?.bets?.find((b) => b.name === 'Match Winner');
      const val = (label: string) => bet?.values.find((v) => v.value === label)?.odd;
      const home = val('Home');
      const draw = val('Draw');
      const away = val('Away');
      if (!home || !draw || !away) return null;
      return {
        fixture_id: f.id,
        bookmaker_id: id,
        bookmaker_name: name,
        home_odd: Number(home),
        draw_odd: Number(draw),
        away_odd: Number(away),
        updated_at: new Date().toISOString(),
      };
    }).filter((r): r is NonNullable<typeof r> => r != null);
    if (rows.length) await db.from('match_odds').upsert(rows, { onConflict: 'fixture_id,bookmaker_id' });
  }

  const pred = predictions[0];
  const toNum = (s: string | undefined | null) => (s ? Number(s.replace('%', '')) : null);
  let fotmobFacts: Array<{ templateId: string; values: string[] }> | null = null;
  // Argumentos derivados de la respuesta de API-Football que YA pagamos
  // (nunca los mirábamos): cara a cara histórico, forma de liga y media de
  // goles. Añaden variedad a los 2-3 "goal streak" repetitivos de Fotmob.
  const afFacts = buildAfFacts(pred);
  const fmId = f.source_ids?.fotmob;
  if (fmId != null) {
    const details = await getMatchDetails(fmId as number, { live: false });
    const facts = details?.content?.matchFacts?.poll?.oddspoll?.Facts ?? [];
    if (facts.length) {
      const uniq = new Map<string, { templateId: string; values: string[] }>();
      for (const fact of facts) {
        uniq.set(`${fact.TextTemplateId}:${JSON.stringify(fact.StatValues)}`, {
          templateId: fact.TextTemplateId,
          values: fact.StatValues,
        });
      }
      fotmobFacts = [...uniq.values()];
    }
  }

  // AF primero (más variado), luego los de Fotmob. La columna se llama
  // `fotmob_facts` por historia; ahora guarda argumentos de ambas fuentes.
  const allFacts = [...afFacts, ...(fotmobFacts ?? [])];

  if (pred || allFacts.length) {
    await db.from('match_predictions').upsert(
      {
        fixture_id: f.id,
        percent_home: toNum(pred?.predictions?.percent?.home),
        percent_draw: toNum(pred?.predictions?.percent?.draw),
        percent_away: toNum(pred?.predictions?.percent?.away),
        form_home: toNum(pred?.comparison?.form?.home),
        form_away: toNum(pred?.comparison?.form?.away),
        att_home: toNum(pred?.comparison?.att?.home),
        att_away: toNum(pred?.comparison?.att?.away),
        def_home: toNum(pred?.comparison?.def?.home),
        def_away: toNum(pred?.comparison?.def?.away),
        fotmob_facts: allFacts.length ? allFacts : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'fixture_id' },
    );
  }

  await db.from('fixtures').update({ predictions_synced_at: new Date().toISOString() }).eq('id', f.id);
  return calls;
}

type Fact = { templateId: string; values: string[] };

/**
 * Argumentos de previa derivados de la respuesta de API-Football `/predictions`
 * (ya la pedimos para el %; solo mirábamos `percent` y `comparison`).
 *   - af_h2h      cara a cara histórico (sirve también en Champions J1: el
 *                 array `h2h` es de TODAS las competiciones)
 *   - af_form     forma en la liga (WDL -> el front lo pinta V/E/D); vacío en
 *                 J1 de Champions, no se emite
 *   - af_goals    media de goles a favor/en contra de los últimos 5
 */
function buildAfFacts(pred: import('../sources/apiFootball.js').AfPrediction | undefined): Fact[] {
  if (!pred) return [];
  const out: Fact[] = [];
  const homeId = pred.teams?.home?.id ?? null;

  const h2h = pred.h2h ?? [];
  if (h2h.length >= 2 && homeId != null) {
    let hw = 0, aw = 0, dr = 0;
    for (const m of h2h) {
      const gh = m.goals?.home;
      const ga = m.goals?.away;
      if (gh == null || ga == null) continue;
      const homeIsOurs = m.teams?.home?.id === homeId;
      const ours = homeIsOurs ? gh : ga;
      const theirs = homeIsOurs ? ga : gh;
      if (ours > theirs) hw++;
      else if (ours < theirs) aw++;
      else dr++;
    }
    const n = hw + aw + dr;
    if (n >= 2) out.push({ templateId: 'af_h2h', values: ['home_team', 'away_team', String(n), String(hw), String(aw), String(dr)] });
  }

  const trim5 = (s: string | null | undefined) => (s ?? '').replace(/[^WDL]/gi, '').slice(-5).toUpperCase();
  const hf = trim5(pred.teams?.home?.league?.form);
  const af = trim5(pred.teams?.away?.league?.form);
  if (hf.length >= 3 && af.length >= 3) {
    out.push({ templateId: 'af_form', values: ['home_team', hf, 'away_team', af] });
  }

  const pos = (s: string | null | undefined) => {
    const n = Number(s);
    return Number.isFinite(n) && n > 0 ? n.toFixed(1) : null;
  };
  const hFor = pos(pred.teams?.home?.last_5?.goals?.for?.average);
  const hAg = pos(pred.teams?.home?.last_5?.goals?.against?.average);
  const aFor = pos(pred.teams?.away?.last_5?.goals?.for?.average);
  const aAg = pos(pred.teams?.away?.last_5?.goals?.against?.average);
  if (hFor && aFor && hAg && aAg) {
    out.push({ templateId: 'af_goals', values: ['home_team', hFor, hAg, 'away_team', aFor, aAg] });
  }

  return out;
}
