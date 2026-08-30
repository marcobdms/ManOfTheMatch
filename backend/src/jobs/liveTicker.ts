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

async function upsertTickerEvents(f: LiveFixtureRow, events: FotmobTickerEvent[]): Promise<number> {
  const rows = [];
  for (const [i, e] of events.entries()) {
    const type = mapFotmobTickerEvent(e.type, e.card, e.ownGoal, e.goalDescriptionKey);
    if (!type) continue;

    const teamId = e.isHome == null ? null : e.isHome ? f.home_team_id : f.away_team_id;
    const playerName =
      type === 'SUB' ? (e.swap?.[1]?.name ?? null) : (e.player?.name ?? null);
    const assistName = type === 'SUB' ? (e.swap?.[0]?.name ?? null) : null;

    // Fotmob no da un id de evento estable en todos los tipos (Half/AddedTime
    // no traen `eventId`) — hash determinista por (tipo, minuto, jugador,
    // índice) para que un re-fetch del mismo minuto no duplique la fila.
    const sourceEventId = `${e.type}:${e.time ?? 'x'}:${e.overloadTime ?? 0}:${e.player?.id ?? playerName ?? i}`;

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

  if (!rows.length) return 0;
  const { error } = await db
    .from('match_events')
    .upsert(rows, { onConflict: 'fixture_id,source,source_event_id', ignoreDuplicates: true });
  if (error) throw error;
  return rows.length;
}

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
  const { error } = await db
    .from('match_shots')
    .upsert(rows, { onConflict: 'fixture_id,source,source_shot_id', ignoreDuplicates: true });
  if (error) throw error;
  return rows.length;
}
