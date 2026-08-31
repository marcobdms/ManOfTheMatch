import { db } from '../db.js';
import { withRun } from '../lib/run.js';
import { getMatch } from '../sources/footballData.js';
import { getSummary } from '../sources/espn.js';
import { getLivescores, getTimeline } from '../sources/theSportsDB.js';
import type { TsdbLiveEvent } from '../sources/theSportsDB.js';
import { pushGoal, pushKickoff, pushMatchday } from '../notify.js';
import { GOAL_EVENT_TYPES, mapFootballDataStatus, mapTheSportsDbEvent, mapTheSportsDbStatus } from '../lib/map.js';
import { isTrackedSlug, teamName, teamSlugByTsdbId } from '../lib/ids.js';

/**
 * Runs every minute (POLL.liveSeconds). For every fixture that is LIVE /
 * PAUSED, or whose kickoff is within ±2 h, refresh score / minute / status from
 * football-data.org (fallback: TheSportsDB `livescore.php`), diff `match_events`
 * from the TheSportsDB timeline, and fire a GOAL push to each side's favorite-team
 * followers when the score goes up (api-research.md §6.4 / §6.5 / §2). Also scans
 * today's + the ±2 h window's fixtures for MATCHDAY / KICKOFF_SOON pushes
 * (docs/handoff-schema-notify.md §4).
 *
 * The per-minute cron is cheap on idle minutes (one indexed select → return).
 * Real API cadence is shaped by the cache TTLs (getMatch ~90 s, livescore ~50 s,
 * timeline ~150 s) per the polling plan §4.2.
 */

const WINDOW_MS = 2 * 60 * 60 * 1000;
// Red de seguridad: un partido SCHEDULED cuyo kickoff ya pasó hace horas y
// segue sin promocionar a LIVE (fuente principal — football-data — congelada
// para ese partido puntual, visto en real con Celta-Athletic del
// 2026-08-30: "lastUpdated" se paró en TIMED a las 20:51Z y no se movió más)
// se quedaba huérfano al salir de la ventana +-2h de "ahora" sin que nadie
// lo terminara de sincronizar. Se amplía solo el borde hacia atrás para
// seguir intentando resincronizarlo durante 24h en vez de abandonarlo.
const ORPHAN_WINDOW_MS = 24 * 60 * 60 * 1000;
// Ningún partido sigue en juego 3,5 h después del saque inicial. Pasado ese
// punto se fuerza FINISHED aunque TODAS las fuentes sigan diciendo lo
// contrario: football-data puede congelarse en TIMED/IN_PLAY para un partido
// suelto (visto en real con Celta-Athletic y Deportivo-Valencia del 30/08),
// TheSportsDB solo lista lo que está en vivo ahora mismo, y el scoreboard de
// ESPN solo trae los partidos del día — o sea que un fixture atascado en LIVE
// pasada la medianoche ya no tiene ninguna fuente que lo pueda cerrar, y el
// reloj nativo del cliente sigue contando (el "1133'").
const MAX_MATCH_MS = 3.5 * 60 * 60 * 1000;
const SKIP_STATUSES = new Set(['FINISHED', 'POSTPONED', 'SUSPENDED']);

/** TheSportsDB devuelve todo como string (o null / ""). */
function toScore(v: string | null | undefined): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Marcador final de ESPN para un partido ya jugado — solo se llama al cerrar
 *  un fixture rancio al que le falta el resultado. Devuelve null si ESPN no
 *  lo da (circuito abierto, sin id, o partido sin terminar allí). */
async function espnFinalScore(espnId: unknown): Promise<{ home: number; away: number } | null> {
  if (espnId == null) return null;
  const summary = await getSummary(String(espnId));
  const comp = summary?.header?.competitions?.[0];
  if (!comp?.status?.type?.completed) return null;
  const home = toScore(comp.competitors?.find((c) => c.homeAway === 'home')?.score);
  const away = toScore(comp.competitors?.find((c) => c.homeAway === 'away')?.score);
  return home != null && away != null ? { home, away } : null;
}

type FixtureRow = {
  id: string;
  source_ids: Record<string, string | number> | null;
  status: string;
  kickoff_at: string;
  home_team_id: string | null;
  away_team_id: string | null;
  home_team_name: string | null;
  away_team_name: string | null;
  home_score: number | null;
  away_score: number | null;
  last_synced_at: string | null;
  minute: number | null;
  half_started_at: string | null;
  half_number: number | null;
};

const SELECT =
  'id, source_ids, status, kickoff_at, home_team_id, away_team_id, home_team_name, away_team_name, ' +
  'home_score, away_score, last_synced_at, minute, half_started_at, half_number';

export function liveLoop() {
  return withRun('liveLoop', 'football-data', async () => {
    const nowMs = Date.now();
    const lo = new Date(nowMs - ORPHAN_WINDOW_MS).toISOString();
    const hi = new Date(nowMs + WINDOW_MS).toISOString();
    const dayStart = new Date(nowMs);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime() + 24 * 3_600_000);

    const [{ data: playing }, { data: soon }, { data: today }] = await Promise.all([
      db.from('fixtures').select(SELECT).in('status', ['LIVE', 'PAUSED']),
      db.from('fixtures').select(SELECT).gte('kickoff_at', lo).lte('kickoff_at', hi),
      db
        .from('fixtures')
        .select(SELECT)
        .eq('status', 'SCHEDULED')
        .gte('kickoff_at', dayStart.toISOString())
        .lt('kickoff_at', dayEnd.toISOString()),
    ]);

    await pushScheduledNotifications(nowMs, (soon ?? []) as unknown as FixtureRow[], (today ?? []) as unknown as FixtureRow[]);

    const byId = new Map<string, FixtureRow>();
    for (const f of (playing ?? []) as unknown as FixtureRow[]) byId.set(f.id, f);
    for (const f of (soon ?? []) as unknown as FixtureRow[]) {
      if (!SKIP_STATUSES.has(f.status)) byId.set(f.id, f);
    }
    const active = [...byId.values()];
    if (active.length === 0) return 0;

    let livescore: TsdbLiveEvent[] = [];
    try {
      const ls = await getLivescores();
      livescore = ls.livescore ?? ls.events ?? [];
    } catch (err) {
      console.warn('[liveLoop] livescore fetch failed', err);
    }

    let touched = 0;
    for (const f of active) {
      try {
        await syncOne(f, livescore);
        touched++;
      } catch (err) {
        console.error(`[liveLoop] fixture ${f.id} failed`, err);
      }
    }
    return touched;
  });
}

async function syncOne(f: FixtureRow, livescore: TsdbLiveEvent[]): Promise<void> {
  const sids = f.source_ids ?? {};
  const fdId = sids.footballData;
  const tsdbId = sids.theSportsDb != null ? String(sids.theSportsDb) : null;

  let status = f.status;
  let minute: number | null = null;
  let home: number | null = f.home_score;
  let away: number | null = f.away_score;
  let htHome: number | null = null;
  let htAway: number | null = null;
  let gotHt = false;

  // 1) football-data.org single match — primary (delayed, but authoritative).
  if (fdId != null) {
    try {
      const m = await getMatch(fdId);
      const fdStatus = mapFootballDataStatus(m.status);
      // football-data solo usa PAUSED para el descanso; una vez confirmada la
      // 2a parte (half_number=2) un PAUSED aqui es un dato viejo/cacheado, no
      // un descanso real (no existe descanso en la 2a parte) — se ignora en
      // vez de pisar el LIVE ya fijado por liveTickerEspn.
      if (!(fdStatus === 'PAUSED' && f.half_number === 2)) status = fdStatus;
      if (typeof m.minute === 'number') minute = m.minute;
      home = m.score?.fullTime?.home ?? home;
      away = m.score?.fullTime?.away ?? away;
      if (m.score?.halfTime) {
        htHome = m.score.halfTime.home;
        htAway = m.score.halfTime.away;
        gotHt = true;
      }
    } catch (err) {
      console.warn(`[liveLoop] getMatch failed for ${f.id}`, err);
    }
  }

  // 2) TheSportsDB livescore. Rellena huecos (minuto, marcador si fd no dio
  //    nada) Y ADEMÁS adelanta el marcador cuando va por delante.
  //
  //    Por qué "el más alto gana": football-data se cachea 90 s y encima llega
  //    con retraso propio, así que durante ~2 min sirve un marcador viejo pero
  //    NO nulo — con la regla anterior ("solo si fd no dio nada") ese valor
  //    obsoleto ganaba siempre y el gol tardaba minutos en subir aunque
  //    TheSportsDB (TTL 50 s) ya lo tuviera. Un marcador no baja en un partido,
  //    así que quedarse con el máximo de ambas fuentes es seguro: adelanta el
  //    gol sin poder inventar uno que no existe.
  const ls = tsdbId ? livescore.find((x) => x.idEvent === tsdbId) : undefined;
  if (ls) {
    const lsStatus = mapTheSportsDbStatus(ls.strStatus);
    if (status === 'SCHEDULED' && (lsStatus === 'LIVE' || lsStatus === 'PAUSED')) status = lsStatus;
    if (minute == null) {
      const p = Number.parseInt(ls.strProgress ?? '', 10);
      if (Number.isFinite(p)) minute = p;
    }
    const lsHome = toScore(ls.intHomeScore);
    const lsAway = toScore(ls.intAwayScore);
    if (lsHome != null) home = home == null ? lsHome : Math.max(home, lsHome);
    if (lsAway != null) away = away == null ? lsAway : Math.max(away, lsAway);
  }

  // 3) Timeline → diff match_events (source = theSportsDb).
  const freshGoals: { home: boolean; minute: number | null; player: string | null }[] = [];
  if (tsdbId) {
    try {
      const timeline = (await getTimeline(tsdbId)).timeline ?? [];
      if (timeline.length) {
        const { data: existing } = await db
          .from('match_events')
          .select('source_event_id')
          .eq('fixture_id', f.id)
          .eq('source', 'theSportsDb');
        const seen = new Set((existing ?? []).map((r: { source_event_id: string }) => r.source_event_id));

        const toInsert = [];
        for (const it of timeline) {
          const type = mapTheSportsDbEvent(it.strTimeline, it.strTimelineDetail);
          if (!type) continue;
          // Clave derivada del CONTENIDO, nunca de `idTimeline`: TheSportsDB
          // reemite el mismo evento con otro id entre polls (confirmado en
          // vivo: gol de Baena al 4', ids 1869881 y 1869902), y usar ese id
          // volátil metía el mismo gol dos veces en el histórico.
          const seid = `${it.intTime ?? 'x'}:${it.strTimeline ?? ''}:${(it.strPlayer ?? '').trim().toLowerCase()}`;
          if (seen.has(seid)) continue;

          const isHome = (it.strHome ?? '').toLowerCase() === 'yes';
          const mnt = Number.parseInt(it.intTime ?? '', 10);
          const minuteVal = Number.isFinite(mnt) ? mnt : null;

          toInsert.push({
            fixture_id: f.id,
            type,
            minute: minuteVal,
            minute_extra: null,
            team_id: teamSlugByTsdbId(it.idTeam) ?? (isHome ? f.home_team_id : f.away_team_id),
            player_name: it.strPlayer || null,
            player_id: it.idPlayer || null,
            assist_name: it.strAssist && it.strAssist !== '0' ? it.strAssist : null,
            detail: it.strTimelineDetail || it.strComment || null,
            sort_key: Number.isFinite(Number(seid)) ? Number(seid) : minuteVal ?? 0,
            source: 'theSportsDb',
            source_event_id: seid,
          });

          if (GOAL_EVENT_TYPES.has(type)) {
            // Own goal counts for the *other* side.
            freshGoals.push({ home: type === 'OWN_GOAL' ? !isHome : isHome, minute: minuteVal, player: it.strPlayer || null });
          }
        }

        if (toInsert.length) {
          await db
            .from('match_events')
            .upsert(toInsert, { onConflict: 'fixture_id,source,source_event_id', ignoreDuplicates: true });
        }
      }
    } catch (err) {
      console.warn(`[liveLoop] timeline failed for ${f.id}`, err);
    }
  }

  // 3.5) Guard de partido rancio: pasado MAX_MATCH_MS desde el kickoff no
  //      puede seguir sin terminar, diga lo que diga la fuente. Si además no
  //      tenemos marcador, se intenta rellenar con el summary de ESPN (ese sí
  //      responde por partido concreto, no solo por el día de hoy).
  const staleMs = Date.now() - Date.parse(f.kickoff_at);
  if (status !== 'FINISHED' && staleMs > MAX_MATCH_MS) {
    console.warn(`[liveLoop] ${f.id} lleva ${Math.round(staleMs / 60000)}min desde el kickoff en ${status} — se cierra a FINISHED`);
    status = 'FINISHED';
    minute = null;
    if (home == null || away == null) {
      const espnScore = await espnFinalScore(sids.espn);
      if (espnScore) {
        home = espnScore.home;
        away = espnScore.away;
      }
    }
  }

  // 4) Persist score / status. Only write HT once a source actually reported it,
  //    so a transient fetch failure never blanks a known half-time score.
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status,
    minute,
    home_score: home,
    away_score: away,
    last_synced_at: now,
    updated_at: now,
  };
  if (gotHt) {
    patch.home_score_ht = htHome;
    patch.away_score_ht = htAway;
  }

  const clock = nextClockAnchor(f, status, minute, Date.parse(now));
  if (clock) {
    patch.half_started_at = clock.startedAt;
    patch.half_number = clock.half;
  }
  // Al cerrar el partido se tira el ancla: sin esto queda un `half_started_at`
  // viejo del que el cliente podría volver a tirar si el estado se reabriera.
  if (status === 'FINISHED') patch.half_started_at = null;

  await db.from('fixtures').update(patch).eq('id', f.id);

  // 5) GOAL notifications — only once we've seen this fixture before (avoids a
  //    burst of stale pushes on worker restart) and only when the score rose.
  if (f.last_synced_at != null) {
    await maybePushGoals(f, home, away, freshGoals);
  }
}

// Tolerancia antes de mover la ancla del reloj nativo: un jitter normal entre
// fuentes (±1-2') no debe reiniciar el reloj del cliente cada minuto, solo un
// desfase real (inicio de parte, tiempo añadido, o VAR) lo hace.
const CLOCK_DRIFT_TOLERANCE_MIN = 2;

/**
 * Decide si mover la ancla `half_started_at`/`half_number` del reloj nativo
 * que corre en el cliente (`minuto = ancla + segundos transcurridos`, sin
 * llamar al backend en cada tick — pedido explícito: no todo el rato por API).
 * Solo se mueve cuando:
 *   - no había ancla todavía (primer minuto real que llega), o
 *   - cambia de parte (minute cruza 45 tras el descanso), o
 *   - el minuto real difiere de lo que la ancla actual predeciría en más de
 *     `CLOCK_DRIFT_TOLERANCE_MIN` (tiempo añadido, VAR, corrección de fuente).
 * Nunca se mueve en PAUSED (el reloj del cliente se congela ahí) ni sin un
 * `minute` real que ancle contra algo.
 */
function nextClockAnchor(
  f: FixtureRow,
  status: string,
  minute: number | null,
  nowMs: number,
): { startedAt: string; half: number } | null {
  if (status !== 'LIVE' || minute == null) return null;

  const half = minute > 45 ? 2 : 1;
  const halfBaseMinute = half === 2 ? 45 : 0;
  const predictedStart = nowMs - (minute - halfBaseMinute) * 60_000;

  const hasAnchor = f.half_started_at != null && f.half_number != null;
  const changedHalf = hasAnchor && f.half_number !== half;

  if (!hasAnchor || changedHalf) {
    return { startedAt: new Date(predictedStart).toISOString(), half };
  }

  const predictedMinuteNow = halfBaseMinute + (nowMs - Date.parse(f.half_started_at!)) / 60_000;
  const drift = Math.abs(predictedMinuteNow - minute);
  if (drift > CLOCK_DRIFT_TOLERANCE_MIN) {
    return { startedAt: new Date(predictedStart).toISOString(), half };
  }

  return null; // ancla actual sigue siendo válida — no reescribir en cada tick
}

/**
 * Fires GOAL pushes to BOTH sides' favorite-team followers — the scoring
 * team's fans ("Gol del X") and the conceding team's fans ("Gol del rival").
 * With all 20 LaLiga clubs seeded, `isTrackedSlug` is true for either side of
 * any LaLiga fixture; a non-seeded Champions League opponent simply has no
 * followers to notify (`pushGoal` no-ops on an empty audience).
 */
async function maybePushGoals(
  f: FixtureRow,
  newHome: number | null,
  newAway: number | null,
  freshGoals: { home: boolean; minute: number | null; player: string | null }[],
): Promise<void> {
  const prevHome = f.home_score ?? 0;
  const prevAway = f.away_score ?? 0;
  const dHome = (newHome ?? prevHome) - prevHome;
  const dAway = (newAway ?? prevAway) - prevAway;
  if (dHome <= 0 && dAway <= 0) return;

  const score = `${newHome ?? '?'}-${newAway ?? '?'}`;

  const fire = async (scoringSide: 'home' | 'away') => {
    const scoringTeamId = scoringSide === 'home' ? f.home_team_id : f.away_team_id;
    const concedingTeamId = scoringSide === 'home' ? f.away_team_id : f.home_team_id;
    const scoringName =
      teamName(scoringTeamId) ?? (scoringSide === 'home' ? f.home_team_name : f.away_team_name);
    const scorer = freshGoals.find((g) => g.home === (scoringSide === 'home'))?.player ?? null;
    const body = [scorer, score].filter(Boolean).join(' · ');

    if (isTrackedSlug(scoringTeamId)) {
      await pushGoal({
        fixtureId: f.id,
        teamId: scoringTeamId,
        title: `Gol del ${scoringName ?? 'equipo'}`,
        body,
      });
    }
    if (isTrackedSlug(concedingTeamId)) {
      await pushGoal({
        fixtureId: f.id,
        teamId: concedingTeamId,
        title: `Gol del rival${scoringName ? ` (${scoringName})` : ''}`,
        body,
      });
    }
  };

  if (dHome > 0) await fire('home');
  if (dAway > 0) await fire('away');
}

/**
 * MATCHDAY (once, any time today's date is first seen for a SCHEDULED
 * fixture) and KICKOFF_SOON (once, from T-15min to kickoff) — for each
 * seeded team on either side of the fixture, gated by that team's own
 * `prefs`. Dedup is the `notifications` log itself: `pushMatchday`/
 * `pushKickoff` insert a row there, so the next minute's scan skips a
 * (fixture, type, team) combo that already has one.
 */
async function pushScheduledNotifications(
  nowMs: number,
  soon: FixtureRow[],
  today: FixtureRow[],
): Promise<void> {
  const kickoffSoon = soon.filter((f) => {
    if (f.status !== 'SCHEDULED') return false;
    const delta = new Date(f.kickoff_at).getTime() - nowMs;
    return delta <= 15 * 60_000 && delta > 0;
  });
  if (today.length === 0 && kickoffSoon.length === 0) return;

  const fixtureIds = [...new Set([...today, ...kickoffSoon].map((f) => f.id))];
  const { data: sent } = await db
    .from('notifications')
    .select('fixture_id, type, team_id')
    .in('fixture_id', fixtureIds)
    .in('type', ['MATCHDAY', 'KICKOFF_SOON']);
  const sentKeys = new Set((sent ?? []).map((r) => `${r.fixture_id}:${r.type}:${r.team_id}`));

  const forEachSide = async (
    f: FixtureRow,
    type: 'MATCHDAY' | 'KICKOFF_SOON',
    push: typeof pushMatchday,
  ) => {
    const sides: Array<['home' | 'away', string | null, string | null]> = [
      ['home', f.home_team_id, f.away_team_id],
      ['away', f.away_team_id, f.home_team_id],
    ];
    for (const [, teamId, opponentId] of sides) {
      if (!isTrackedSlug(teamId) || sentKeys.has(`${f.id}:${type}:${teamId}`)) continue;
      const teamLabel = teamName(teamId) ?? teamId;
      const opponentLabel = teamName(opponentId) ?? (opponentId === f.home_team_id ? f.home_team_name : f.away_team_name) ?? 'rival';
      const kickoffLocal = new Date(f.kickoff_at).toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Madrid',
      });
      const title = type === 'MATCHDAY' ? `Hoy juega el ${teamLabel}` : `${teamLabel} empieza en 15 minutos`;
      const body = type === 'MATCHDAY' ? `vs ${opponentLabel} · ${kickoffLocal}` : `vs ${opponentLabel}`;
      await push({ fixtureId: f.id, teamId, title, body });
    }
  };

  for (const f of today) await forEachSide(f, 'MATCHDAY', pushMatchday);
  for (const f of kickoffSoon) await forEachSide(f, 'KICKOFF_SOON', pushKickoff);
}
