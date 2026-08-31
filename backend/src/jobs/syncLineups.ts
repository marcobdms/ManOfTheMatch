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
import { TEAMS, TRACKED_TEAM_IDS } from '../lib/shared.js';
import type { TeamId } from '../lib/shared.js';
import { fotmobPositionLabel } from '../lib/map.js';
import {
  getMatchesByDate,
  getMatchDetails,
  LALIGA_LEAGUE_ID,
} from '../sources/fotmob.js';
import type { FotmobLineupTeam, FotmobPlayer } from '../sources/fotmob.js';

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

    console.log(`[syncLineups] ${written}/${TRACKED_TEAM_IDS.length} equipos actualizados`);
    return written;
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

  const players = mapPlayers(side.starters ?? [], true, teamId).concat(mapPlayers(side.subs ?? [], false, teamId));
  if (!players.length) return false;

  const opponentName = isHome ? fixture.away_team_name : fixture.home_team_name;
  const opponentCrest = isHome ? fixture.away_team_crest : fixture.home_team_crest;

  await db.from('team_lineup_snapshots').upsert({
    team_id: teamId,
    fixture_id: fixture.id,
    opponent_name: opponentName,
    opponent_crest: opponentCrest,
    is_home: isHome,
    kickoff_at: fixture.kickoff_at,
    formation: side.formation ?? null,
    coach: side.coach?.name ?? null,
    lineup_type: lineupType,
    players,
    source: 'fotmob',
    updated_at: new Date().toISOString(),
  });

  // Historial crudo en `lineups` (0001), para que syncMatchDetail (API-Football)
  // pueda pisarlo después con datos confirmados cuando el partido esté en vivo.
  await upsertRawLineupRows(fixture.id, teamId, side, lineupType);

  return true;
}

function mapPlayers(list: FotmobPlayer[], isStarter: boolean, teamId: TeamId): LineupPlayer[] {
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
  teamId: TeamId,
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
  teamId: TeamId,
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
      'id, home_team_id, away_team_id, home_team_name, away_team_name, home_team_crest, away_team_crest, kickoff_at, status, source_ids',
    )
    .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
    .eq('status', status)
    .order('kickoff_at', { ascending: order === 'asc' })
    .limit(1)
    .returns<FixtureRow[]>();
  return data?.[0] ?? null;
}

/** Resuelve y cachea el `matchId` de Fotmob para un fixture, cruzando fecha +
 *  nombres de equipo. Se guarda en `fixtures.source_ids.fotmob` para no
 *  repetir la búsqueda en la siguiente pasada. */
async function resolveFotmobMatchId(fixture: FixtureRow): Promise<number | null> {
  const cached = fixture.source_ids?.fotmob;
  if (cached != null) {
    const n = Number(cached);
    if (Number.isFinite(n)) return n;
  }

  const day = fixture.kickoff_at.slice(0, 10).replace(/-/g, ''); // YYYYMMDD
  const calendar = await getMatchesByDate(day);
  if (!calendar) return null; // fallo de red/circuit breaker

  const laliga = calendar.leagues?.find((l) => l.id === LALIGA_LEAGUE_ID);
  const matches = laliga?.matches ?? [];
  if (!matches.length) return null;

  const homeSlug = teamSlugFromFotmobName(fixture.home_team_name);
  const awaySlug = teamSlugFromFotmobName(fixture.away_team_name);

  const match = matches.find((m) => {
    const mHome = teamSlugFromFotmobName(m.home?.name);
    const mAway = teamSlugFromFotmobName(m.away?.name);
    if (homeSlug && mHome !== homeSlug) return false;
    if (awaySlug && mAway !== awaySlug) return false;
    return Boolean(homeSlug || awaySlug);
  });
  if (!match) return null;

  await db
    .from('fixtures')
    .update({
      source_ids: { ...(fixture.source_ids ?? {}), fotmob: match.id },
      updated_at: new Date().toISOString(),
    })
    .eq('id', fixture.id);

  return match.id;
}

// --- cruce de nombres Fotmob <-> nuestros 20 slugs -------------------------

let normalizedTeamNames: Map<TeamId, Set<string>> | null = null;

const STOPWORDS = new Set(['cf', 'fc', 'cd', 'ud', 'sd', 'rc', 'ca', 'ac', 'sc', 'rcd', 'club', 'de', 'balompie', 'balompié']);

/** Tokens en minúsculas, sin acentos ni sufijos societarios/stopwords. */
function tokenize(name: string): string[] {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita acentos
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((t) => t && !STOPWORDS.has(t));
}

function buildNameIndex(): Map<TeamId, Set<string>> {
  const idx = new Map<TeamId, Set<string>>();
  for (const t of Object.values(TEAMS)) {
    const id = t.id as TeamId;
    idx.set(id, new Set([...tokenize(t.name), ...tokenize(t.tla), ...tokenize(id.replace(/-/g, ' '))]));
  }
  return idx;
}

// football-data.org da "RCD Espanyol de Barcelona" — el sufijo de ciudad hace
// que el cruce por tokens empate con "FC Barcelona". Es el único caso conocido
// entre los 20 clubes; se recorta antes de tokenizar en vez de complicar el
// desempate genérico.
const KNOWN_NAME_FIXUPS: Array<[RegExp, string]> = [[/\bespanyol de barcelona\b/i, 'espanyol']];

function applyKnownFixups(name: string): string {
  let out = name;
  for (const [pattern, replacement] of KNOWN_NAME_FIXUPS) out = out.replace(pattern, replacement);
  return out;
}

/** Nombre inline (`fixtures.home_team_name`) o de Fotmob → nuestro slug, por
 *  solapamiento de tokens. Gana el equipo con más tokens en común; `null` si
 *  no hay ninguno — no se inventa. */
function teamSlugFromFotmobName(name: string | null | undefined): TeamId | null {
  if (!name) return null;
  if (!normalizedTeamNames) normalizedTeamNames = buildNameIndex();
  const tokens = new Set(tokenize(applyKnownFixups(name)));
  if (!tokens.size) return null;

  let best: { slug: TeamId; score: number } | null = null;
  for (const [slug, aliasTokens] of normalizedTeamNames) {
    let score = 0;
    for (const t of aliasTokens) if (tokens.has(t)) score++;
    if (score > 0 && (!best || score > best.score)) best = { slug, score };
  }
  return best?.slug ?? null;
}
