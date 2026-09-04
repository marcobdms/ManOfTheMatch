// Histórico en vivo (goles/tarjetas/cambios/descanso + disparos) desde
// Fotmob — decisión de Marco: más completo que TheSportsDB (14 eventos vs 5
// en el mismo partido probado) y sin cuota, así que puede refrescarse cada
// ~10s en vez de cada varios minutos como API-Football.
//
// Solo corre contra fixtures LIVE/PAUSED — nunca barre los 380 fixtures de la
// temporada. LaLiga no solapa partidos salvo las 2 últimas jornadas
// (confirmado en el calendario real), así que en la práctica esto son 0-2
// peticiones cada 10s, no una por cada uno de los 20 equipos.
//
// El propio adapter (sources/fotmob.ts) ya serializa + throttlea (≥3s entre
// fetches reales) + circuit-breakea (abre 30 min tras 3 fallos 429/403/503) a
// nivel de módulo — así que aunque este job dispare varias llamadas por
// tick, nunca hay dos peticiones a Fotmob en paralelo ni se insiste contra un
// bloqueo real. Un 429/403/503 nunca llega hasta aquí como excepción: el
// adapter lo traduce a `null` y este job simplemente conserva el histórico
// anterior en ese tick.
import { db } from '../db.js';
import { withRun } from '../lib/run.js';
import { fotmobCircuitStatus, getMatchDetails } from '../sources/fotmob.js';
import type { FotmobShot, FotmobTickerEvent } from '../sources/fotmob.js';
import { mapFotmobTickerEvent } from '../lib/map.js';
import { reconcileRetracted } from '../lib/eventReconcile.js';
import { narrateEvent } from '../lib/narrate.js';
import { teamName } from '../lib/ids.js';

type LiveFixtureRow = {
  id: string;
  status: string;
  home_team_id: string | null;
  away_team_id: string | null;
  source_ids: Record<string, string | number> | null;
};

export function liveTicker() {
  return withRun('liveTicker', 'fotmob', async () => {
    const { data: rows } = await db
      .from('fixtures')
      .select('id, status, home_team_id, away_team_id, source_ids')
      .in('status', ['LIVE', 'PAUSED']);

    const fixtures = (rows ?? []) as LiveFixtureRow[];
    if (!fixtures.length) return 0;

    // Si el circuit breaker de Fotmob está abierto, este tick no va a
    // conseguir nada nuevo — lo dejamos EN `sync_runs.error` (vía `withRun`,
    // que marca `ok:false` cuando la función lanza) para que sea visible
    // desde la propia tabla sin tener que leer logs de Coolify. No relanza
    // ni insiste contra Fotmob: el circuito ya está gestionando eso solo.
    const circuit = fotmobCircuitStatus();
    if (circuit.open) {
      throw new Error(
        `[fotmob] circuito abierto tras ${circuit.consecutiveFailures} fallos seguidos — ` +
          `pausado hasta ${circuit.openUntil}. Histórico en vivo detenido temporalmente, ` +
          `el resto de la app sigue funcionando con los datos ya guardados.`,
      );
    }

    let touched = 0;
    for (const f of fixtures) {
      try {
        const did = await syncOneTicker(f);
        if (did) touched++;
      } catch (err) {
        console.error(`[liveTicker] ${f.id} falló, se conserva histórico anterior`, err);
      }
    }
    return touched;
  });
}

async function syncOneTicker(f: LiveFixtureRow): Promise<boolean> {
  const matchId = f.source_ids?.fotmob;
  if (matchId == null) return false; // aún sin resolver — syncLineups.ts lo rellena

  const details = await getMatchDetails(matchId, { live: true });
  if (!details) return false; // fallo de red / circuit breaker → se conserva lo anterior

  const teams = details.header?.teams ?? [];
  const homeFotmobId = teams[0]?.id ?? null;
  const awayFotmobId = teams[1]?.id ?? null;

  const nEvents = await upsertTickerEvents(f, details.content?.matchFacts?.events?.events ?? []);
  const nShots = await upsertShots(f, details.content?.shotmap?.shots ?? [], homeFotmobId, awayFotmobId);
  return nEvents > 0 || nShots > 0;
}

/** Fotmob canta un gol antes de resolver quién lo metió y manda literalmente
 *  "<TBD>" de nombre mientras tanto — lo tratamos como "todavía no sabemos",
 *  igual que si no hubiera nombre, en vez de guardar el placeholder tal cual
 *  (visto en real: "GOL del Getafe — <TBD>" en el histórico). */
function cleanPlayerName(name: string | null | undefined): string | null {
  const trimmed = name?.trim() ?? '';
  if (!trimmed || /^<.*>$/.test(trimmed) || trimmed.toUpperCase() === 'TBD') return null;
  return trimmed;
}

async function upsertTickerEvents(f: LiveFixtureRow, events: FotmobTickerEvent[]): Promise<number> {
  // Para narrar solo lo REALMENTE nuevo (no en cada re-poll de 10s) hace
  // falta saber qué ids ya teníamos antes de tocar nada.
  const { data: existing } = await db
    .from('match_events')
    .select('source_event_id')
    .eq('fixture_id', f.id)
    .eq('source', 'fotmob');
  const seen = new Set((existing ?? []).map((r: { source_event_id: string }) => r.source_event_id));

  const rows = [];
  for (const [i, e] of events.entries()) {
    const type = mapFotmobTickerEvent(e.type, e.card, e.ownGoal, e.goalDescriptionKey);
    if (!type) continue;

    const teamId = e.isHome == null ? null : e.isHome ? f.home_team_id : f.away_team_id;
    // swap[0] = entra, swap[1] = sale — verificado contra alineación titular
    // real (Robert Navarro, titular, aparecía como swap[1] al ser sustituido).
    const playerName = cleanPlayerName(
      type === 'SUB' ? e.swap?.[0]?.name : e.player?.name,
    );
    const assistName = type === 'SUB' ? cleanPlayerName(e.swap?.[1]?.name) : null;

    // Fotmob corrige goles despues (autogol reatribuido, VAR) cambiando el
    // jugador — usar `eventId` (estable) cuando existe, no el jugador, o la
    // correccion crea una fila duplicada en vez de reemplazar la vieja.
    const sourceEventId = e.eventId != null
      ? String(e.eventId)
      : `${e.type}:${e.time ?? 'x'}:${e.overloadTime ?? 0}:${e.player?.id ?? playerName ?? i}`;

    rows.push({
      fixture_id: f.id,
      type,
      minute: e.time ?? null,
      minute_extra: e.overloadTime ?? null,
      team_id: teamId,
      player_name: playerName,
      player_id: e.player?.id != null ? String(e.player.id) : null,
      assist_name: assistName,
      detail: type === 'PERIOD' ? (e.halfStrShort ?? null) : null,
      sort_key: i,
      source: 'fotmob',
      source_event_id: sourceEventId,
    });
  }

  if (rows.length) {
    const { error } = await db
      .from('match_events')
      .upsert(rows, { onConflict: 'fixture_id,source,source_event_id' });
    if (error) throw error;
  }

  // `events` es el estado ACTUAL del partido segun Fotmob, no un log que
  // solo crece (ver lib/eventReconcile.ts) — solo si esta vez SI llegaron
  // eventos reales se reconcilia contra lo que ya teniamos.
  if (events.length && rows.length) {
    await reconcileRetracted(f.id, 'fotmob', rows.map((r) => r.source_event_id));
  }

  const brandNew = rows.filter((r) => !seen.has(r.source_event_id) && GOAL_KIND[r.type]);
  if (brandNew.length) await narrateNewGoals(f, brandNew);

  return rows.length;
}

const GOAL_KIND: Partial<Record<string, 'goal' | 'own_goal' | 'penalty_goal'>> = {
  GOAL: 'goal',
  OWN_GOAL: 'own_goal',
  PENALTY_GOAL: 'penalty_goal',
};

async function narrateNewGoals(
  f: LiveFixtureRow,
  goals: Array<{ type: string; team_id: string | null; player_name: string | null; source_event_id: string; minute: number | null }>,
): Promise<void> {
  const { data: fx } = await db
    .from('fixtures')
    .select('home_score, away_score')
    .eq('id', f.id)
    .maybeSingle();
  if (!fx) return;

  for (const g of goals) {
    const isHome = g.team_id === f.home_team_id;
    const team = teamName(g.team_id);
    const opponent = teamName(isHome ? f.away_team_id : f.home_team_id);
    if (!team || !opponent) continue; // rival no seguido (Champions) — sin nombre fiable, no se narra

    const narration = await narrateEvent({
      kind: GOAL_KIND[g.type] ?? 'goal',
      minute: g.minute,
      team,
      opponent,
      player: g.player_name,
      homeScore: fx.home_score ?? 0,
      awayScore: fx.away_score ?? 0,
    });
    if (narration) {
      await db
        .from('match_events')
        .update({ narration })
        .eq('fixture_id', f.id)
        .eq('source', 'fotmob')
        .eq('source_event_id', g.source_event_id);
    }
  }
}

// xG a partir del cual un disparo fallado se narra como "ocasión clara" en el
// histórico — 0.35 es lo que suele marcarse "big chance" en la práctica
// (un mano a mano o un remate franco dentro del área), no cualquier tiro.
// Umbral de xG para que un disparo entre en el histórico como ocasión. 0.35
// dejaba el histórico muy vacío (en un partido normal caen 2-3 disparos así);
// 0.18 mete también los remates claros que no son mano a mano y da un relato
// mucho más vivo, sin llenarlo de tiros lejanos sin peligro.
const BIG_CHANCE_XG = 0.18;

async function upsertShots(
  f: LiveFixtureRow,
  shots: FotmobShot[],
  homeFotmobId: number | null,
  awayFotmobId: number | null,
): Promise<number> {
  const rows = shots
    .map((s) => {
      const teamId =
        s.teamId === homeFotmobId ? f.home_team_id : s.teamId === awayFotmobId ? f.away_team_id : null;
      return {
        fixture_id: f.id,
        team_id: teamId,
        player_name: s.playerName,
        minute: s.min ?? null,
        minute_extra: s.minAdded ?? null,
        event_type: s.eventType,
        situation: s.situation ?? null,
        is_on_target: s.isOnTarget ?? null,
        is_blocked: s.isBlocked ?? null,
        expected_goals: s.expectedGoals ?? null,
        source: 'fotmob',
        source_shot_id: String(s.id),
      };
    })
    // Los goles ya quedan en match_events — el shotmap es para lo que ningún
    // otro sitio muestra (tiros fuera, parados, palos si Fotmob los marcara).
    .filter((r) => r.event_type !== 'Goal');

  if (!rows.length) return 0;

  // Para narrar solo las ocasiones REALMENTE nuevas (no en cada re-poll).
  const { data: existing } = await db
    .from('match_shots')
    .select('source_shot_id')
    .eq('fixture_id', f.id)
    .eq('source', 'fotmob');
  const seen = new Set((existing ?? []).map((r: { source_shot_id: string }) => r.source_shot_id));

  const { error } = await db
    .from('match_shots')
    .upsert(rows, { onConflict: 'fixture_id,source,source_shot_id', ignoreDuplicates: true });
  if (error) throw error;

  const bigChances = rows.filter(
    (r) => !seen.has(r.source_shot_id) && (r.expected_goals ?? 0) >= BIG_CHANCE_XG,
  );
  if (bigChances.length) await narrateBigChances(f, bigChances);

  return rows.length;
}

/** Frase corta de reserva a partir de los campos reales de `match_shots`.
 *  Nunca menciona el palo: Fotmob no lo marca (ver 0008). */
function shotDetail(s: {
  event_type: string;
  situation: string | null;
  is_on_target: boolean | null;
  is_blocked: boolean | null;
}): string | null {
  const parts: string[] = [];
  if (s.is_blocked) parts.push('remate bloqueado');
  else if (s.event_type === 'AttemptSaved') parts.push('la para el portero');
  else if (s.is_on_target === false) parts.push('se va fuera');

  const origen: Record<string, string> = {
    FromCorner: 'tras córner',
    FreeKick: 'de falta',
    SetPiece: 'a balón parado',
    FastBreak: 'al contraataque',
  };
  const from = s.situation ? origen[s.situation] : undefined;
  if (from) parts.push(from);

  return parts.length ? parts.join(' · ') : null;
}

/** Inserta la ocasión en el histórico (`match_events`, tipo CHANCE) y la
 *  narra. `source:'fotmob-shot'` a propósito — distinto de 'fotmob' (los
 *  eventos del ticker) para que `reconcileRetracted`, que solo mira
 *  source='fotmob', nunca la confunda con un evento retirado y la borre. */
async function narrateBigChances(
  f: LiveFixtureRow,
  chances: Array<{
    team_id: string | null;
    player_name: string | null | undefined;
    minute: number | null;
    expected_goals: number | null;
    event_type: string;
    situation: string | null;
    is_on_target: boolean | null;
    is_blocked: boolean | null;
    source_shot_id: string;
  }>,
): Promise<void> {
  const { data: fx } = await db
    .from('fixtures')
    .select('home_score, away_score')
    .eq('id', f.id)
    .maybeSingle();
  if (!fx) return;

  for (const c of chances) {
    const isHome = c.team_id === f.home_team_id;
    const team = teamName(c.team_id);
    const opponent = teamName(isHome ? f.away_team_id : f.home_team_id);
    if (!team || !opponent) continue; // rival no seguido (Champions) — sin nombre fiable, no se narra
    const playerName = c.player_name ?? null;

    const narration = await narrateEvent({
      kind: 'big_chance',
      minute: c.minute,
      team,
      opponent,
      player: playerName,
      homeScore: fx.home_score ?? 0,
      awayScore: fx.away_score ?? 0,
      xg: c.expected_goals,
      // Datos reales del disparo (`match_shots`, 0008): sin esto todas las
      // ocasiones se narraban igual de genéricas.
      shot: {
        result: c.event_type,
        situation: c.situation,
        onTarget: c.is_on_target,
        blocked: c.is_blocked,
      },
    });

    await db.from('match_events').upsert(
      {
        fixture_id: f.id,
        type: 'CHANCE',
        minute: c.minute,
        team_id: c.team_id,
        player_name: playerName,
        // Detalle legible con lo que sí sabemos del disparo — es lo que pinta
        // el frontend cuando no hay narración de Groq, así que sin esto el
        // histórico se queda en "Ocasión clara desperdiciada" y poco más.
        detail: shotDetail(c),
        source: 'fotmob-shot',
        source_event_id: c.source_shot_id,
        narration,
      },
      { onConflict: 'fixture_id,source,source_event_id' },
    );
  }
}
