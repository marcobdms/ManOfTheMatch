// Ticker de baja latencia (ESPN, ~2s) — SOLO mientras haya fixtures LIVE/PAUSED.
// docs/plan-2026-08-29.md: fotmob.com/matchDetails cachea 5min en su CDN, no
// sirve para latencia; ESPN scoreboard es max-age=1 y trae goles/tarjetas con
// minuto real. Con 0 partidos en vivo este job no hace ninguna petición.
//
// Reentrancia: se registra con `protect: true` en bootstrap.ts (igual que
// syncLineups), y aquí además hay un guard local por si el intervalo interno
// se solapase con el cron externo.

import { db } from '../db.js';
import { withRun } from '../lib/run.js';
import { getScoreboard } from '../sources/espn.js';
import type { EspnDetail, EspnEvent } from '../sources/espn.js';
import { GOAL_EVENT_TYPES, mapEspnEvent, mapEspnStatus } from '../lib/map.js';
import { nextClockAnchor } from './liveLoop.js';
import { reconcileRetracted } from '../lib/eventReconcile.js';
import { narrateEvent } from '../lib/narrate.js';
import { pushGoal } from '../notify.js';
import { isTrackedSlug, teamName, teamSlugByEspnId } from '../lib/ids.js';

type FixtureRow = {
  id: string;
  source_ids: Record<string, unknown> | null;
  status: string;
  kickoff_at: string;
  home_team_id: string | null;
  away_team_id: string | null;
  home_score: number | null;
  away_score: number | null;
  half_started_at: string | null;
  half_number: number | null;
};

const SELECT =
  'id, source_ids, status, kickoff_at, home_team_id, away_team_id, home_score, away_score, ' +
  'half_started_at, half_number';

let running = false;

/** Llamado cada ~2s por el intervalo en bootstrap.ts. Vacío y sin red si no
 *  hay nada LIVE/PAUSED — la query es el único coste en el caso ocioso. */
export async function liveTickerEspnTick(): Promise<void> {
  if (running) return; // reentrancia: un tick anterior aún no terminó
  running = true;
  try {
    const { data } = await db.from('fixtures').select(SELECT).in('status', ['LIVE', 'PAUSED']);
    const active = (data ?? []) as unknown as FixtureRow[];
    if (active.length === 0) return;

    await withRun('liveTickerEspn', 'espn', async () => {
      const board = await getScoreboard();
      if (!board) return 0; // fallo de red / circuit breaker abierto

      let touched = 0;
      for (const f of active) {
        try {
          const ev = matchEvent(f, board.events ?? []);
          if (!ev) continue;
          await syncOne(f, ev);
          touched++;
        } catch (err) {
          console.error(`[liveTickerEspn] fixture ${f.id} falló`, err);
        }
      }
      return touched;
    });
  } finally {
    running = false;
  }
}

/** Fixture -> evento ESPN: por id cacheado en `source_ids.espn`, o cruzando
 *  por el id de equipo (home) ya resuelto en `teams.source_ids.espn`. */
function matchEvent(f: FixtureRow, events: EspnEvent[]): EspnEvent | null {
  const cachedId = f.source_ids?.espn != null ? String(f.source_ids.espn) : null;
  if (cachedId) {
    const hit = events.find((e) => e.id === cachedId);
    if (hit) return hit;
  }

  for (const e of events) {
    const comp = e.competitions?.[0];
    const home = comp?.competitors?.find((c) => c.homeAway === 'home');
    const away = comp?.competitors?.find((c) => c.homeAway === 'away');
    const homeSlug = teamSlugByEspnId(home?.team?.id);
    const awaySlug = teamSlugByEspnId(away?.team?.id);
    if (homeSlug && awaySlug && homeSlug === f.home_team_id && awaySlug === f.away_team_id) {
      return e;
    }
  }
  return null;
}

async function syncOne(f: FixtureRow, ev: EspnEvent): Promise<void> {
  const comp = ev.competitions?.[0];
  const status = comp?.status ?? ev.status;
  const mapped = mapEspnStatus(status?.type?.name, status?.type?.state);
  const minute = parseMinute(status?.displayClock);

  const homeC = comp?.competitors?.find((c) => c.homeAway === 'home');
  const awayC = comp?.competitors?.find((c) => c.homeAway === 'away');
  const home = homeC?.score != null ? Number(homeC.score) : f.home_score;
  const away = awayC?.score != null ? Number(awayC.score) : f.away_score;

  // Cachear el id de evento ESPN en el fixture la primera vez que se cruza.
  if (f.source_ids?.espn == null) {
    await db
      .from('fixtures')
      .update({ source_ids: { ...(f.source_ids ?? {}), espn: ev.id } })
      .eq('id', f.id);
  }

  const freshGoals = await upsertEvents(f, ev.id, comp?.details ?? [], home, away);

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: mapped,
    minute,
    home_score: home,
    away_score: away,
    last_synced_at: now,
    updated_at: now,
  };

  // El ancla del reloj nativo vive aqui, no en liveLoop.ts: ese depende de
  // football-data + TheSportsDB, que en la practica no siempre coinciden en
  // LIVE+minuto a la vez para un partido concreto (visto en real: un partido
  // entero con `half_started_at` en NULL pese a progresar bien). ESPN cada 2s
  // es la fuente que de verdad tiene status+minuto fiables a la vez.
  const clock = nextClockAnchor(f, mapped, minute, Date.parse(now));
  if (clock) {
    patch.half_started_at = clock.startedAt;
    patch.half_number = clock.half;
  }
  if (mapped === 'FINISHED') patch.half_started_at = null;

  await db.from('fixtures').update(patch).eq('id', f.id);

  if (freshGoals.length) await maybePushGoals(f, home, away, freshGoals);
}

/** "45'+4'" -> 45, "34'" -> 34. Sin minuto (p.ej. descanso) -> null. */
function parseMinute(displayClock: string | null | undefined): number | null {
  if (!displayClock) return null;
  const m = /^(\d+)/.exec(displayClock.trim());
  return m ? Number(m[1]) : null;
}

async function upsertEvents(
  f: FixtureRow,
  espnEventId: string,
  details: EspnDetail[],
  homeScore: number | null,
  awayScore: number | null,
): Promise<{ home: boolean; minute: number | null; player: string | null }[]> {
  if (!details.length) return [];

  const { data: existing } = await db
    .from('match_events')
    .select('source_event_id')
    .eq('fixture_id', f.id)
    .eq('source', 'espn');
  const seen = new Set((existing ?? []).map((r: { source_event_id: string }) => r.source_event_id));

  const toInsert = [];
  const currentIds: string[] = [];
  const freshGoals: { home: boolean; minute: number | null; player: string | null }[] = [];

  for (const [i, d] of details.entries()) {
    const type = mapEspnEvent(d);
    if (!type) continue;

    const teamEspnId = d.team?.id ?? null;
    const slug = teamSlugByEspnId(teamEspnId);
    const isHome = slug != null && slug === f.home_team_id;
    const minute = parseMinute(d.clock?.displayValue) ?? (d.clock?.value != null ? Math.floor(d.clock.value / 60) : null);
    const player = d.athletesInvolved?.[0]?.displayName ?? null;
    const sourceEventId = `${minute ?? 'x'}:${d.type?.text ?? ''}:${player ?? i}`;
    currentIds.push(sourceEventId);
    if (seen.has(sourceEventId)) continue;

    toInsert.push({
      fixture_id: f.id,
      type,
      minute,
      minute_extra: null,
      team_id: slug ?? (isHome ? f.home_team_id : f.away_team_id),
      player_name: player,
      player_id: d.athletesInvolved?.[0]?.id ?? null,
      assist_name: null, // ESPN no distingue asistente en `details[]`
      detail: d.type?.text ?? null,
      sort_key: minute ?? i,
      source: 'espn',
      source_event_id: sourceEventId,
    });

    if (GOAL_EVENT_TYPES.has(type)) {
      freshGoals.push({ home: type === 'OWN_GOAL' ? !isHome : isHome, minute, player });
    }
  }

  if (toInsert.length) {
    await db.from('match_events').upsert(toInsert, { onConflict: 'fixture_id,source,source_event_id', ignoreDuplicates: true });
    const newGoals = toInsert.filter((r) => GOAL_EVENT_TYPES.has(r.type as never));
    if (newGoals.length) await narrateNewGoals(f, newGoals, homeScore, awayScore);
  }

  // `details` es el estado ACTUAL de ESPN, no un log (ver lib/eventReconcile.ts).
  if (currentIds.length) {
    await reconcileRetracted(f.id, 'espn', currentIds);
  }

  return freshGoals;
}

const GOAL_KIND: Partial<Record<string, 'goal' | 'own_goal' | 'penalty_goal'>> = {
  GOAL: 'goal',
  OWN_GOAL: 'own_goal',
  PENALTY_GOAL: 'penalty_goal',
};

async function narrateNewGoals(
  f: FixtureRow,
  goals: Array<{ type: string; team_id: string | null; player_name: string | null; source_event_id: string; minute: number | null }>,
  homeScore: number | null,
  awayScore: number | null,
): Promise<void> {
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
      homeScore: homeScore ?? 0,
      awayScore: awayScore ?? 0,
    });
    if (narration) {
      await db
        .from('match_events')
        .update({ narration })
        .eq('fixture_id', f.id)
        .eq('source', 'espn')
        .eq('source_event_id', g.source_event_id);
    }
  }
}

/** Igual que `liveLoop.maybePushGoals` — duplicado a propósito (patrón ya
 *  establecido: cada adapter/job es responsable de su propio diff). */
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
    const scoringName = teamName(scoringTeamId);
    const scorer = freshGoals.find((g) => g.home === (scoringSide === 'home'))?.player ?? null;
    const body = [scorer, score].filter(Boolean).join(' · ');

    if (isTrackedSlug(scoringTeamId)) {
      await pushGoal({ fixtureId: f.id, teamId: scoringTeamId, title: `Gol del ${scoringName ?? 'equipo'}`, body });
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
