/**
 * Resuelve el `matchId` de Fotmob para un fixture de CUALQUIER competición y
 * lo cachea en `fixtures.source_ids.fotmob`. syncLineups tiene su propia
 * versión LaLiga-only; esto cubre Champions (y de paso vale para LaLiga),
 * cruzando el calendario del día por nombre de liga + nombres de equipo.
 */
import { db } from '../db.js';
import { getMatchesByDate, LALIGA_LEAGUE_ID } from '../sources/fotmob.js';
import { ALL_TEAMS } from './shared.js';

const STOPWORDS = new Set([
  'cf', 'fc', 'cd', 'ud', 'sd', 'rc', 'ca', 'ac', 'sc', 'rcd', 'sk', 'kv', 'fk',
  'ssc', 'as', 'pae', 'club', 'de', 'the', 'sad', 'balompie', 'balompié',
]);

function tokenize(name: string): string[] {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

let nameIndex: Map<string, Set<string>> | null = null;
function buildIndex(): Map<string, Set<string>> {
  const idx = new Map<string, Set<string>>();
  for (const t of Object.values(ALL_TEAMS)) {
    idx.set(
      t.id,
      new Set([...tokenize(t.name), ...tokenize(t.tla), ...tokenize(t.id.replace(/-/g, ' '))]),
    );
  }
  return idx;
}

/** Nombre de Fotmob (o inline nuestro) -> slug, por solapamiento de tokens. */
export function slugFromName(name: string | null | undefined): string | null {
  if (!name) return null;
  if (!nameIndex) nameIndex = buildIndex();
  const tokens = new Set(tokenize(name));
  if (!tokens.size) return null;
  let best: { slug: string; score: number } | null = null;
  for (const [slug, aliases] of nameIndex) {
    let score = 0;
    for (const a of aliases) if (tokens.has(a)) score++;
    if (score > 0 && (!best || score > best.score)) best = { slug, score };
  }
  return best?.slug ?? null;
}

const isUclLeague = (name: string | undefined, ccode: string | undefined) =>
  !!name && /champions league/i.test(name) && !/two|women|youth|u1[579]|acl/i.test(name) &&
  (ccode === 'INT' || ccode == null);

type FixtureLike = {
  id: string;
  kickoff_at: string;
  competition_id: string | null;
  home_team_id: string | null;
  away_team_id: string | null;
  home_team_name: string | null;
  away_team_name: string | null;
  source_ids: Record<string, unknown> | null;
};

/** Devuelve el matchId de Fotmob (cacheándolo). null si no se pudo cruzar. */
export async function resolveFotmobMatchId(f: FixtureLike): Promise<number | null> {
  const cached = f.source_ids?.fotmob;
  if (cached != null) {
    const n = Number(cached);
    if (Number.isFinite(n)) return n;
  }

  const day = f.kickoff_at.slice(0, 10).replace(/-/g, '');
  const calendar = await getMatchesByDate(day);
  if (!calendar) return null;

  const wantHome = f.home_team_id ?? slugFromName(f.home_team_name);
  const wantAway = f.away_team_id ?? slugFromName(f.away_team_name);
  if (!wantHome && !wantAway) return null;

  const leagues = (calendar.leagues ?? []).filter((l) =>
    f.competition_id === 'ucl'
      ? isUclLeague(l.name, l.ccode)
      : l.id === LALIGA_LEAGUE_ID,
  );

  for (const league of leagues) {
    for (const m of league.matches ?? []) {
      const mHome = slugFromName(m.home?.name);
      const mAway = slugFromName(m.away?.name);
      const ok =
        wantHome && wantAway
          ? mHome === wantHome && mAway === wantAway
          : wantHome
            ? mHome === wantHome
            : mAway === wantAway;
      if (!ok) continue;

      await db
        .from('fixtures')
        .update({
          source_ids: { ...(f.source_ids ?? {}), fotmob: m.id },
          updated_at: new Date().toISOString(),
        })
        .eq('id', f.id);
      return m.id;
    }
  }
  return null;
}
