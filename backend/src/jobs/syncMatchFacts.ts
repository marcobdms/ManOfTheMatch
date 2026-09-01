// Captura COMPLETA de Fotmob matchDetails (docs/plan-2026-08-29.md §4):
// momentum, stats de equipo por periodo, player stats, shotmap y "hechos" del
// partido (POTM, árbitro, clima, h2h...). Cadencia ~60s — Fotmob cachea 5min
// en su CDN, así que pedir más rápido no trae nada nuevo; `maxAgeSeconds` nos
// salta una copia del CDN si por lo que sea llega con más de 90s de `age`.
//
// Corre para fixtures LIVE/PAUSED, más una pasada final cuando termina
// (`detail_facts_synced_at` null) para dejar el resumen post-partido. Nunca
// borra filas existentes si Fotmob falla — solo upsert de datos buenos.

import { db } from '../db.js';
import { withRun } from '../lib/run.js';
import { getMatchDetails } from '../sources/fotmob.js';
import type {
  FotmobMatchDetails,
  FotmobPlayerStatsEntry,
  FotmobShot,
  FotmobStatGroup,
} from '../sources/fotmob.js';

type FixtureRow = {
  id: string;
  status: string;
  source_ids: Record<string, unknown> | null;
  detail_facts_synced_at: string | null;
  home_team_id: string | null;
  away_team_id: string | null;
  kickoff_at: string;
  highlight_url: string | null;
  highlight_checked_at: string | null;
};

// El resumen en vídeo se publica DESPUÉS del pitido final, así que la pasada
// final del partido casi siempre llega demasiado pronto. Se reintenta cada
// HIGHLIGHT_RETRY_H durante HIGHLIGHT_WINDOW_H tras el saque inicial; pasada
// esa ventana se da por hecho que ese partido no va a tener vídeo.
const HIGHLIGHT_WINDOW_H = 72;
const HIGHLIGHT_RETRY_H = 2;

function needsHighlight(f: FixtureRow, now: number): boolean {
  if (f.status !== 'FINISHED' || f.highlight_url) return false;
  const sinceKickoffH = (now - new Date(f.kickoff_at).getTime()) / 3_600_000;
  if (sinceKickoffH > HIGHLIGHT_WINDOW_H) return false;
  if (!f.highlight_checked_at) return true;
  return (now - new Date(f.highlight_checked_at).getTime()) / 3_600_000 >= HIGHLIGHT_RETRY_H;
}

export function syncMatchFacts() {
  return withRun('syncMatchFacts', 'fotmob', async () => {
    const { data } = await db
      .from('fixtures')
      .select(
        'id, status, source_ids, detail_facts_synced_at, home_team_id, away_team_id, ' +
          'kickoff_at, highlight_url, highlight_checked_at',
      )
      .in('status', ['LIVE', 'PAUSED', 'FINISHED']);

    const rows = (data ?? []) as unknown as FixtureRow[];
    const now = Date.now();
    const due = rows.filter(
      (f) =>
        f.status === 'LIVE' ||
        f.status === 'PAUSED' ||
        (f.status === 'FINISHED' && !f.detail_facts_synced_at) ||
        needsHighlight(f, now),
    );
    if (due.length === 0) return 0;

    let written = 0;
    for (const f of due) {
      try {
        const matchId = f.source_ids?.fotmob;
        if (matchId == null) continue; // aún no resuelto por syncLineups — se reintenta en 60s
        const isLive = f.status === 'LIVE' || f.status === 'PAUSED';
        const details = await getMatchDetails(matchId as number, { live: isLive });
        if (!details) continue; // fallo de red / circuit breaker → se conserva lo anterior
        await writeAll(f, details);
        written++;
      } catch (err) {
        console.error(`[syncMatchFacts] ${f.id} falló, se conserva lo anterior`, err);
      }
    }
    console.log(`[syncMatchFacts] ${written}/${due.length} partidos actualizados`);
    return written;
  });
}

/** Guarda el enlace de YouTube del resumen. `highlight_checked_at` se sella
 *  siempre (haya vídeo o no) para espaciar los reintentos. */
async function writeHighlight(f: FixtureRow, details: FotmobMatchDetails): Promise<void> {
  if (f.status !== 'FINISHED' || f.highlight_url) return;

  const h = details.content?.matchFacts?.highlights ?? null;
  const url = h?.url?.trim() || null;
  const patch: Record<string, string | null> = { highlight_checked_at: new Date().toISOString() };
  if (url) {
    patch.highlight_url = url;
    patch.highlight_thumbnail = h?.image?.trim() || null;
  }
  const { error } = await db.from('fixtures').update(patch).eq('id', f.id);
  if (error) console.warn(`[syncMatchFacts] highlight de ${f.id} no se guardó`, error);
}

async function writeAll(f: FixtureRow, details: FotmobMatchDetails): Promise<void> {
  const teams = details.header?.teams ?? [];
  const homeFotmobId = teams[0]?.id ?? null;
  const awayFotmobId = teams[1]?.id ?? null;

  // header.teams[0] es SIEMPRE local, [1] visitante (verificado en vivo) — así
  // mapeamos `teamId` de cada bloque sin depender de source_ids.footballData.
  const slugFor = (fotmobTeamId: number | null | undefined): string | null => {
    if (fotmobTeamId == null) return null;
    if (fotmobTeamId === homeFotmobId) return f.home_team_id;
    if (fotmobTeamId === awayFotmobId) return f.away_team_id;
    return null;
  };

  await Promise.all([
    writeMomentum(f.id, details),
    writeTeamStats(f.id, details),
    writePlayerStats(f.id, details, slugFor),
    writeShots(f.id, details, slugFor),
    writeMatchFacts(f.id, details),
    writeHighlight(f, details),
  ]);

  if (f.status === 'FINISHED') {
    await db.from('fixtures').update({ detail_facts_synced_at: new Date().toISOString() }).eq('id', f.id);
  }
}

async function writeMomentum(fixtureId: string, details: FotmobMatchDetails): Promise<void> {
  const points = details.content?.momentum?.main?.data ?? [];
  if (!points.length) return;
  const rows = points.map((p) => ({ fixture_id: fixtureId, minute: p.minute, value: p.value }));
  await db.from('match_momentum').upsert(rows, { onConflict: 'fixture_id,minute' });
}

const PERIOD_KEYS = ['All', 'FirstHalf', 'SecondHalf'] as const;

async function writeTeamStats(fixtureId: string, details: FotmobMatchDetails): Promise<void> {
  const periods = details.content?.stats?.Periods;
  if (!periods) return;

  const rows: Record<string, unknown>[] = [];
  for (const period of PERIOD_KEYS) {
    const groups: FotmobStatGroup[] = periods[period]?.stats ?? [];
    for (const group of groups) {
      (group.stats ?? []).forEach((item, i) => {
        const [home, away] = Array.isArray(item.stats) ? item.stats : [null, null];
        rows.push({
          fixture_id: fixtureId,
          period,
          stat_group: group.title,
          stat_title: item.title,
          home_value: home == null ? null : String(home),
          away_value: away == null ? null : String(away),
          sort_key: i,
          updated_at: new Date().toISOString(),
        });
      });
    }
  }
  if (!rows.length) return;
  await db.from('match_team_stats').upsert(rows, { onConflict: 'fixture_id,period,stat_group,stat_title' });
}

/** Extrae valores comunes de alto uso del blob anidado de Fotmob; el resto
 *  queda íntegro en `stats_raw` para no perder nada que no anticipamos. */
function findStat(entry: FotmobPlayerStatsEntry, ...keys: string[]): number | null {
  for (const group of entry.stats ?? []) {
    for (const [title, s] of Object.entries(group.stats ?? {})) {
      if (keys.includes(s.key ?? '') || keys.includes(title)) {
        const v = s.stat?.value;
        return typeof v === 'number' ? v : null;
      }
    }
  }
  return null;
}

async function writePlayerStats(
  fixtureId: string,
  details: FotmobMatchDetails,
  slugFor: (id: number | null | undefined) => string | null,
): Promise<void> {
  const players = details.content?.playerStats ?? {};
  const ids = Object.keys(players);
  if (!ids.length) return;

  const rows = ids.flatMap((pid) => {
    const entry = players[pid];
    if (!entry) return [];
    return [{
      fixture_id: fixtureId,
      team_id: slugFor(entry.teamId),
      fotmob_player_id: String(entry.id ?? pid),
      player_name: entry.name,
      rating: findStat(entry, 'rating_title', 'FotMob rating'),
      minutes_played: findStat(entry, 'minutes_played', 'Minutes played'),
      touches: findStat(entry, 'touches', 'Touches'),
      duels_won: findStat(entry, 'duel_won', 'Duels won'),
      duels_lost: findStat(entry, 'duel_lost', 'Duels lost'),
      passes_final_third: null, // formato fracción, no vale un número simple — queda en stats_raw
      saves: entry.isGoalkeeper ? findStat(entry, 'saves', 'Saves') : null,
      goals_prevented: entry.isGoalkeeper ? findStat(entry, 'goals_prevented', 'Goals prevented') : null,
      xgot_faced: entry.isGoalkeeper ? findStat(entry, 'expected_goals_on_target_faced', 'xGOT faced') : null,
      stats_raw: entry.stats ?? null,
      shotmap: null, // el shotmap por jugador es un subset de match_shots — evitar duplicar
      updated_at: new Date().toISOString(),
    }];
  });

  await db.from('match_player_stats_fotmob').upsert(rows, { onConflict: 'fixture_id,fotmob_player_id' });
}

async function writeShots(
  fixtureId: string,
  details: FotmobMatchDetails,
  slugFor: (id: number | null | undefined) => string | null,
): Promise<void> {
  const shots: FotmobShot[] = details.content?.shotmap?.shots ?? [];
  if (!shots.length) return;

  const rows = shots.map((s) => ({
    fixture_id: fixtureId,
    team_id: slugFor(s.teamId),
    fotmob_player_id: s.playerId != null ? String(s.playerId) : null,
    player_name: s.playerName ?? null,
    minute: s.min == null ? null : s.min + (s.minAdded ?? 0) * 0.1, // 45+2 -> 45.2, solo para ordenar
    event_type: s.eventType,
    situation: s.situation ?? null,
    is_on_target: s.isOnTarget ?? null,
    is_blocked: s.isBlocked ?? null,
    is_from_inside_box: s.isFromInsideBox ?? null,
    expected_goals: s.expectedGoals ?? null,
    shot_type: s.shotType ?? null,
    source_shot_id: s.id != null ? String(s.id) : null,
  }));

  await db.from('match_shots').upsert(rows, { onConflict: 'fixture_id,source_shot_id' });
}

async function writeMatchFacts(fixtureId: string, details: FotmobMatchDetails): Promise<void> {
  const mf = details.content?.matchFacts;
  const c = details.content;
  if (!mf && !c?.weather && !c?.h2h && !c?.attackingZones) return;

  await db.from('match_facts').upsert(
    {
      fixture_id: fixtureId,
      potm_name: mf?.playerOfTheMatch?.name?.fullName ?? null,
      potm_rating: mf?.playerOfTheMatch?.rating?.num ? Number(mf.playerOfTheMatch.rating.num) : null,
      stadium_name: mf?.infoBox?.Stadium?.name ?? null,
      stadium_city: mf?.infoBox?.Stadium?.city ?? null,
      stadium_capacity: mf?.infoBox?.Stadium?.capacity ?? null,
      stadium_surface: mf?.infoBox?.Stadium?.surface ?? null,
      referee_name: mf?.infoBox?.Referee?.text ?? null,
      referee_stats: mf?.infoBox?.Referee?.stats ?? null,
      attendance: mf?.infoBox?.Attendance ?? null,
      insights: mf?.insights ?? null,
      top_players: mf?.topPlayers ?? null,
      attacking_zones: c?.attackingZones ?? null,
      weather: c?.weather ?? null,
      h2h: c?.h2h ?? null,
      heatmap_url: c?.heatmapUrl ?? null,
      source: 'fotmob',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'fixture_id' },
  );
}
