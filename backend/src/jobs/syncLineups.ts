// Cron cada 30 min: alineaciones reales (posiciones x/y) desde Fotmob, con
// caída ordenada a "último XI jugado" cuando no hay nada mejor.
// docs/plan-2026-08-29.md §A3 — lógica de frescura, por equipo, en este orden:
//   1) XI confirmado del próximo partido      (lineupType 'standard')
//   2) XI previsto del próximo partido        (lineupType 'predicted')
//   3) XI del último partido jugado           ('last_played')
// Nunca se borra un snapshot existente si la petición falla — solo se
// sobrescribe con datos buenos (regla dura del plan).

import { db } from '../db.js';
import { photoFor, refreshPhotoCache } from '../lib/playerPhotos.js';
import { withRun } from '../lib/run.js';
import { TRACKED_TEAM_IDS } from '../lib/shared.js';
import type { TeamId } from '../lib/shared.js';
import { fotmobPositionLabel } from '../lib/map.js';
import { getMatchDetails } from '../sources/fotmob.js';
import type { FotmobLineupTeam, FotmobPlayer } from '../sources/fotmob.js';
import { resolveFotmobMatchId } from '../lib/fotmobResolve.js';

type LineupType = 'confirmed' | 'predicted' | 'last_played';

/** Forma compartida con el frontend — NO cambiar sin avisar (contrato §A1). */
export type LineupPlayer = {
  name: string;
  shortName: string;
  number: number | null;
  position: string | null;
  x: number;
  y: number;
  age: number | null;
  country: string | null;
  countryCode: string | null;
  rating: number | null;
  seasonRating: number | null;
  isStarter: boolean;
  photoUrl: string | null;
};

type FixtureRow = {
  id: string;
  home_team_id: string | null;
  away_team_id: string | null;
  home_team_name: string | null;
  away_team_name: string | null;
  home_team_crest: string | null;
  away_team_crest: string | null;
  kickoff_at: string;
  status: string;
  competition_id: string | null;
  source_ids: Record<string, unknown> | null;
};

export function syncLineups() {
  return withRun('syncLineups', 'fotmob', async () => {
    // Las fotos cambian de higos a brevas (las resuelve un script aparte), así
    // que basta con releerlas una vez por pasada.
    await refreshPhotoCache();
    let written = 0;

    for (const teamId of TRACKED_TEAM_IDS) {
      try {
        const did = await syncOneTeam(teamId);
        if (did) written++;
      } catch (err) {
        // Un fallo por equipo nunca debe tumbar el resto del sweep — el
        // adapter ya no lanza en condiciones normales, pero por si acaso
        // (p.ej. error de Supabase al leer/escribir).
        console.error(`[syncLineups] ${teamId} falló, se conserva snapshot anterior`, err);
      }
    }

    let ucl = 0;
    try {
      ucl = await syncUclFixtures();
    } catch (err) {
      console.error('[syncLineups] barrido de Champions falló', err);
    }

    console.log(
      `[syncLineups] ${written}/${TRACKED_TEAM_IDS.length} equipos actualizados, ${ucl} lados de Champions`,
    );
    return written + ucl;
  });
}

async function syncOneTeam(teamId: TeamId): Promise<boolean> {
  const next = await findFixture(teamId, 'SCHEDULED', 'asc');
  const last = await findFixture(teamId, 'FINISHED', 'desc');

  const target = next ?? null;
  if (target) {
    const wrote = await tryFromFotmob(teamId, target, /* preferPredicted */ true);
    if (wrote) return true;
  }

  // Fotmob no dio nada usable para el próximo partido (aún no hay lineup, o
  // el circuit breaker está abierto) → probar el último jugado.
  if (last) {
    const wrote = await tryFromFotmob(teamId, last, /* preferPredicted */ false);
    if (wrote) return true;
  }

  return false;
}

/** Busca el `matchId` de Fotmob para un fixture (cacheándolo en
 *  `fixtures.source_ids.fotmob`) y escribe el snapshot si hay lineup. */
async function tryFromFotmob(
  teamId: TeamId,
  fixture: FixtureRow,
  preferPredicted: boolean,
): Promise<boolean> {
  const matchId = await resolveFotmobMatchId(fixture);
  if (matchId == null) return false;

  const isLive = fixture.status === 'LIVE' || fixture.status === 'PAUSED';
  const details = await getMatchDetails(matchId, { live: isLive });
  if (!details) return false; // fallo de red/circuit breaker → el llamador prueba el fallback

  const lineup = details.content?.lineup;
  if (!lineup) return false;

  const isHome = fixture.home_team_id === teamId;
  const side: FotmobLineupTeam | null | undefined = isHome ? lineup.homeTeam : lineup.awayTeam;
  if (!side || (!side.starters?.length && !side.subs?.length)) return false;

  const fotmobType = lineup.lineupType ?? 'predicted';
  // El próximo partido con lineup 'standard' es un XI confirmado; 'predicted'
  // es el probable. Cuando estamos usando el ÚLTIMO partido jugado (no el
  // próximo), siempre es 'last_played' independientemente de lo que diga
  // Fotmob — ya pasó, no hay nada que "predecir".
  const lineupType: LineupType = preferPredicted
    ? fotmobType === 'standard'
      ? 'confirmed'
      : 'predicted'
    : 'last_played';

  return writeSide(teamId, fixture, side, isHome, lineupType);
}

/** Snapshot del equipo + historial crudo en `lineups` (0001), para que
 *  syncMatchDetail (API-Football) pueda pisarlo luego con el XI confirmado. */
async function writeSide(
  teamId: string,
  fixture: FixtureRow,
  side: FotmobLineupTeam,
  isHome: boolean,
  lineupType: LineupType,
): Promise<boolean> {
  const players = mapPlayers(side.starters ?? [], true, teamId).concat(
    mapPlayers(side.subs ?? [], false, teamId),
  );
  if (!players.length) return false;

  await db.from('team_lineup_snapshots').upsert({
    team_id: teamId,
    fixture_id: fixture.id,
    opponent_name: isHome ? fixture.away_team_name : fixture.home_team_name,
    opponent_crest: isHome ? fixture.away_team_crest : fixture.home_team_crest,
    is_home: isHome,
    kickoff_at: fixture.kickoff_at,
    formation: side.formation ?? null,
    coach: side.coach?.name ?? null,
    lineup_type: lineupType,
    players,
    source: 'fotmob',
    updated_at: new Date().toISOString(),
  });

  await upsertRawLineupRows(fixture.id, teamId, side, lineupType);
  return true;
}

/**
 * Barrido de Champions. El bucle de arriba recorre TRACKED_TEAM_IDS (los 20
 * de LaLiga) y de cada partido guarda SOLO su lado: un UCL entre extranjeros
 * se quedaba sin alineación y uno con equipo español solo tenía la mitad.
 * Aquí se recorren los fixtures de Champions de la ventana próxima y se
 * escriben LOS DOS lados con una única llamada a Fotmob por partido.
 */
async function syncUclFixtures(): Promise<number> {
  const now = Date.now();
  const { data } = await db
    .from('fixtures')
    .select(
      'id, home_team_id, away_team_id, home_team_name, away_team_name, home_team_crest, away_team_crest, kickoff_at, status, competition_id, source_ids',
    )
    .eq('competition_id', 'ucl')
    .in('status', ['SCHEDULED', 'LIVE', 'PAUSED'])
    .gte('kickoff_at', new Date(now - 4 * 3_600_000).toISOString())
    .lte('kickoff_at', new Date(now + 72 * 3_600_000).toISOString())
    .order('kickoff_at', { ascending: true })
    .returns<FixtureRow[]>();

  let written = 0;
  for (const f of data ?? []) {
    try {
      const matchId = await resolveFotmobMatchId(f);
      if (matchId == null) continue;

      const isLive = f.status === 'LIVE' || f.status === 'PAUSED';
      const details = await getMatchDetails(matchId, { live: isLive });
      const lineup = details?.content?.lineup;
      if (!lineup) continue;

      const lineupType: LineupType = lineup.lineupType === 'standard' ? 'confirmed' : 'predicted';
      const sides = [
        [lineup.homeTeam, f.home_team_id, true],
        [lineup.awayTeam, f.away_team_id, false],
      ] as const;

      for (const [side, teamId, isHome] of sides) {
        if (!side || !teamId) continue;
        if (await writeSide(teamId, f, side, isHome, lineupType)) written++;
      }
    } catch (err) {
      console.error(`[syncLineups] UCL ${f.id} falló, se conserva lo anterior`, err);
    }
  }
  return written;
}

function mapPlayers(list: FotmobPlayer[], isStarter: boolean, teamId: string): LineupPlayer[] {
  return list.map((p) => {
    const x = p.horizontalLayout?.x ?? null;
    const y = p.horizontalLayout?.y ?? null;
    return {
      name: p.name,
      shortName: p.lastName?.trim() || p.name,
      number: p.shirtNumber ?? null,
      position: fotmobPositionLabel(x, y),
      x: x ?? 0.5,
      y: y ?? 0.5,
      age: p.age ?? null,
      country: p.countryName ?? null,
      countryCode: p.countryCode ?? null,
      rating: p.performance?.rating ?? null,
      seasonRating: p.performance?.seasonRating ?? null,
      isStarter,
      photoUrl: photoFor(teamId, p.name),
    };
  });
}

async function upsertRawLineupRows(
  fixtureId: string,
  teamId: string,
  side: FotmobLineupTeam,
  lineupType: LineupType,
): Promise<void> {
  const now = new Date().toISOString();
  const rows = [
    ...(side.starters ?? []).map((p) => rawRow(fixtureId, teamId, side, p, true, lineupType, now)),
    ...(side.subs ?? []).map((p) => rawRow(fixtureId, teamId, side, p, false, lineupType, now)),
  ];
  if (!rows.length) return;
  await db.from('lineups').upsert(rows, { onConflict: 'fixture_id,team_id,player_name,is_starting' });
}

function rawRow(
  fixtureId: string,
  teamId: string,
  side: FotmobLineupTeam,
  p: FotmobPlayer,
  isStarting: boolean,
  lineupType: LineupType,
  capturedAt: string,
) {
  const x = p.horizontalLayout?.x ?? null;
  const y = p.horizontalLayout?.y ?? null;
  return {
    fixture_id: fixtureId,
    team_id: teamId,
    formation: side.formation ?? null,
    is_starting: isStarting,
    player_id: p.id != null ? String(p.id) : null,
    player_name: p.name,
    shirt_number: p.shirtNumber ?? null,
    position: fotmobPositionLabel(x, y),
    grid: null,
    source: 'fotmob',
    coach: side.coach?.name ?? null,
    pos_x: x,
    pos_y: y,
    position_label: fotmobPositionLabel(x, y),
    age: p.age ?? null,
    country: p.countryName ?? null,
    country_code: p.countryCode ?? null,
    rating: p.performance?.rating ?? null,
    season_rating: p.performance?.seasonRating ?? null,
    market_value: p.marketValue ?? null,
    photo_url: null,
    lineup_type: lineupType === 'confirmed' ? 'confirmed' : 'predicted',
    captured_at: capturedAt,
  };
}

/** Próximo fixture SCHEDULED o último FINISHED de un equipo. */
async function findFixture(
  teamId: TeamId,
  status: 'SCHEDULED' | 'FINISHED',
  order: 'asc' | 'desc',
): Promise<FixtureRow | null> {
  const { data } = await db
    .from('fixtures')
    .select(
      'id, home_team_id, away_team_id, home_team_name, away_team_name, home_team_crest, away_team_crest, kickoff_at, status, competition_id, source_ids',
    )
    .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
    .eq('status', status)
    .order('kickoff_at', { ascending: order === 'asc' })
    .limit(1)
    .returns<FixtureRow[]>();
  return data?.[0] ?? null;
}
