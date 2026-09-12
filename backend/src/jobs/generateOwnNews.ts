/**
 * Noticias escritas SOLO con datos nuestros — sin fuente externa, sin riesgo
 * de copiar a nadie y sin depender de que Marca publique. Cubre los tres temas
 * que ya tenemos en la base:
 *
 *   PREVIA  — partido en las próximas 36h (fixtures + newsContext)
 *   ONCE    — hay once inicial confirmado para un partido (lineups)
 *   CRONICA — partido recién terminado (marcador y goleadores)
 *
 * Las tres fases de UN MISMO partido comparten fila: `url` es
 * `motm://match/<fixture_id>` para las tres, así que la previa se CONVIERTE en
 * la noticia del once y luego en la de la crónica, en vez de generar tres
 * piezas sueltas que se pisan en el feed ("El Celta recibe al Málaga" +
 * "Alineaciones confirmadas Celta-Málaga" como dos noticias distintas). Cada
 * salto de fase reescribe la pieza desde cero y la sube arriba del feed — es
 * información nueva de verdad, no un refresco.
 */
import { db } from '../db.js';
import { withRun } from '../lib/run.js';
import { TEAM_NAME } from '../lib/newsTaxonomy.js';
import type { TeamId } from '../lib/shared.js';

const PREVIEW_WINDOW_H = 36;
const RECAP_WINDOW_H = 12;

/**
 * Clubes con tirón suficiente para que una previa temprana (36h antes, sin
 * datos concretos aún) merezca la pena por sí sola. El resto de cruces de
 * LaLiga entre equipos modestos se cubren igual, pero a partir del once
 * confirmado — ahí ya hay algo concreto que contar. Champions no se filtra:
 * cualquier cruce de la fase de liga interesa.
 */
const IMPORTANT_TEAM_IDS = new Set<TeamId>([
  'real-madrid',
  'barcelona',
  'atletico-madrid',
  'athletic-bilbao',
  'sevilla',
  'valencia',
  'real-sociedad',
  'real-betis',
  'villarreal',
]);

type Fx = {
  id: string;
  home_team_id: string | null;
  away_team_id: string | null;
  home_team_name: string | null;
  away_team_name: string | null;
  competition_id: string | null;
  kickoff_at: string;
  status: string;
  home_score: number | null;
  away_score: number | null;
};

const FX_COLS =
  'id, home_team_id, away_team_id, home_team_name, away_team_name, competition_id, ' +
  'kickoff_at, status, home_score, away_score';

/**
 * Nombre del equipo: primero el catálogo de LaLiga, luego el nombre inline que
 * la fuente guarda para los rivales de Champions (`fixtures.home_team_name`).
 * Devuelve null si no lo sabemos — en ese caso no se genera la noticia, para
 * no acabar con titulares tipo "El rival recibe al rival".
 */
function teamLabel(id: string | null, inlineName: string | null): string | null {
  if (id && TEAM_NAME[id as TeamId]) return TEAM_NAME[id as TeamId];
  const n = inlineName?.trim();
  return n || null;
}

/** Solo se guarda `team_id` si es un slug real de LaLiga (FK a teams). */
function slugOrNull(id: string | null): string | null {
  return id && TEAM_NAME[id as TeamId] ? id : null;
}

const compLabel = (c: string | null) => (c === 'ucl' ? 'la Champions' : 'LaLiga');

/** Ninguno de los dos es un club grande: la previa temprana se descarta (poco
 *  interés todavía), pero el partido se sigue cubriendo en el once y la
 *  crónica, que sí tienen algo concreto que contar. */
function isMinorMatchup(f: Fx): boolean {
  if (f.competition_id !== 'laliga') return false;
  const homeBig = !!f.home_team_id && IMPORTANT_TEAM_IDS.has(f.home_team_id as TeamId);
  const awayBig = !!f.away_team_id && IMPORTANT_TEAM_IDS.has(f.away_team_id as TeamId);
  return !homeBig && !awayBig;
}

const TOPIC_RANK: Record<'PREVIA' | 'ONCE' | 'CRONICA', number> = { PREVIA: 1, ONCE: 2, CRONICA: 3 };

/**
 * Guarda o hace evolucionar la pieza de UN partido (`url = motm://match/<id>`,
 * compartida por sus tres fases).
 *   - No existe todavía → se inserta como draft, fase actual.
 *   - Existe en una fase de MENOR rango → salto real (previa→once→crónica):
 *     se reescribe la pista, vuelve a `draft` para que rewriteNews la
 *     rehaga desde cero, y `published_at` se actualiza para que suba arriba
 *     del feed — es información nueva, no un retoque.
 *   - Existe en la MISMA fase y sigue en draft → solo se refresca la pista
 *     (puede haber cambiado el once o el marcador entre pasadas).
 *   - Existe en una fase de MAYOR rango → no se toca (la crónica no vuelve a
 *     convertirse en previa).
 */
async function upsertMatchStory(
  fixtureId: string,
  topic: 'PREVIA' | 'ONCE' | 'CRONICA',
  row: Record<string, unknown>,
): Promise<boolean> {
  const url = `motm://match/${fixtureId}`;
  const { data: existing } = await db.from('news').select('id, status, topic').eq('url', url).maybeSingle();

  if (!existing) {
    const { error } = await db.from('news').insert({ ...row, url, topic });
    if (error) {
      console.error('[generateOwnNews] insert falló', error);
      return false;
    }
    return true;
  }

  const cur = existing as { id: string; status: string; topic: string | null };
  const curRank = cur.topic ? (TOPIC_RANK[cur.topic as 'PREVIA' | 'ONCE' | 'CRONICA'] ?? 0) : 0;
  const newRank = TOPIC_RANK[topic];

  if (newRank > curRank) {
    await db
      .from('news')
      .update({
        original_title: row.original_title,
        summary: row.summary ?? null,
        team_id: row.team_id,
        subject: row.subject,
        topic,
        status: 'draft',
        published_at: new Date().toISOString(),
        image_state: 'pending',
      })
      .eq('id', cur.id);
    return false;
  }

  if (newRank === curRank && cur.status === 'draft') {
    await db
      .from('news')
      .update({
        original_title: row.original_title,
        summary: row.summary ?? null,
        team_id: row.team_id,
        subject: row.subject,
      })
      .eq('id', cur.id);
  }
  return false;
}

export function generateOwnNews() {
  return withRun('generateOwnNews', 'news', async () => {
    const now = Date.now();
    let created = 0;

    // --- PREVIA: partidos de las próximas 36h ---
    const { data: upcoming } = await db
      .from('fixtures')
      .select(FX_COLS)
      .eq('status', 'SCHEDULED')
      .gte('kickoff_at', new Date(now).toISOString())
      .lte('kickoff_at', new Date(now + PREVIEW_WINDOW_H * 3600_000).toISOString())
      .order('kickoff_at', { ascending: true })
      .limit(10);

    const upcomingRows = (upcoming ?? []) as unknown as Fx[];

    for (const f of upcomingRows) {
      if (isMinorMatchup(f)) continue;
      const home = teamLabel(f.home_team_id, f.home_team_name);
      const away = teamLabel(f.away_team_id, f.away_team_name);
      if (!home || !away) continue;
      const ok = await upsertMatchStory(f.id, 'PREVIA', {
        title: `Previa: ${home} - ${away}`,
        original_title: `El ${home} recibe al ${away} en ${compLabel(f.competition_id)}`,
        original_url: null,
        original_source: 'ManOfTheMatch',
        published_at: new Date().toISOString(),
        team_id: slugOrNull(f.home_team_id),
        fixture_id: f.id,
        subject: null,
        status: 'draft',
        image_state: 'pending',
      });
      if (ok) created++;
    }

    // --- ONCE: alineación confirmada de un partido próximo ---
    // Sin filtro de "equipo grande": el once ya es un dato concreto que
    // merece pieza propia aunque no hubiera previa antes.
    const fixtureIds = upcomingRows.map((f) => f.id);
    if (fixtureIds.length) {
      const { data: lineups } = await db
        .from('lineups')
        .select('fixture_id, team_id, formation')
        .in('fixture_id', fixtureIds)
        .eq('is_starting', true);

      const byFixture = new Map<string, { teams: Set<string>; formation: string | null }>();
      for (const l of (lineups ?? []) as Array<{ fixture_id: string; team_id: string; formation: string | null }>) {
        const e = byFixture.get(l.fixture_id) ?? { teams: new Set<string>(), formation: null };
        e.teams.add(l.team_id);
        e.formation = e.formation ?? l.formation;
        byFixture.set(l.fixture_id, e);
      }

      for (const [fixtureId, info] of byFixture) {
        // Solo cuando están los DOS onces: con uno solo la noticia va coja.
        if (info.teams.size < 2) continue;
        const f = upcomingRows.find((x) => x.id === fixtureId);
        if (!f) continue;
        const home = teamLabel(f.home_team_id, f.home_team_name);
        const away = teamLabel(f.away_team_id, f.away_team_name);
        if (!home || !away) continue;
        const ok = await upsertMatchStory(fixtureId, 'ONCE', {
          title: `Ya hay onces para el ${home} - ${away}`,
          original_title:
            `Confirmados los onces iniciales del ${home} - ${away}` +
            (info.formation ? ` (${home} sale con ${info.formation})` : ''),
          original_url: null,
          original_source: 'ManOfTheMatch',
          published_at: new Date().toISOString(),
          team_id: slugOrNull(f.home_team_id),
          fixture_id: fixtureId,
          subject: null,
          status: 'draft',
          image_state: 'pending',
        });
        if (ok) created++;
      }
    }

    // --- CRONICA: partidos terminados en las últimas 12h ---
    const { data: finished } = await db
      .from('fixtures')
      .select(FX_COLS)
      .eq('status', 'FINISHED')
      .gte('kickoff_at', new Date(now - RECAP_WINDOW_H * 3600_000).toISOString())
      .order('kickoff_at', { ascending: false })
      .limit(10);

    for (const f of (finished ?? []) as unknown as Fx[]) {
      if (f.home_score == null || f.away_score == null) continue;
      const home = teamLabel(f.home_team_id, f.home_team_name);
      const away = teamLabel(f.away_team_id, f.away_team_name);
      if (!home || !away) continue;

      const homeWon = f.home_score > f.away_score;
      const draw = f.home_score === f.away_score;

      // Los goles, atribuidos a su equipo: sin esto la pista decía "terminan
      // 0-5, goles de Pedri..." y el modelo no sabía que el 5 era del Barça
      // (jugaba fuera) — llegó a titular "Barcelona pierde 0-5".
      const { data: scorers } = await db
        .from('match_events')
        .select('player_name, team_id')
        .eq('fixture_id', f.id)
        .in('type', ['GOAL', 'PENALTY_GOAL', 'OWN_GOAL'])
        .limit(12);
      const goalsFor = (team: string | null) =>
        [
          ...new Set(
            (scorers ?? [])
              .filter((s: { team_id: string | null }) => s.team_id === team)
              .map((s: { player_name: string | null }) => s.player_name)
              .filter((n): n is string => !!n),
          ),
        ];
      const homeGoals = goalsFor(f.home_team_id);
      const awayGoals = goalsFor(f.away_team_id);

      const winnerName = homeWon ? home : away;
      const loserName = homeWon ? away : home;
      const ws = Math.max(f.home_score, f.away_score);
      const ls = Math.min(f.home_score, f.away_score);

      const goalLine = (label: string, list: string[]) =>
        list.length ? ` Goles del ${label}: ${list.join(', ')}.` : '';

      const pista = draw
        ? `El ${home} y el ${away} empatan ${f.home_score}-${f.away_score} (el ${home} jugaba en casa).` +
          goalLine(home, homeGoals) +
          goalLine(away, awayGoals)
        : `El ${winnerName} gana ${ws}-${ls} ${homeWon ? 'en casa al' : 'a domicilio al'} ${loserName}.` +
          goalLine(home, homeGoals) +
          goalLine(away, awayGoals);

      const winnerId = draw ? f.home_team_id : homeWon ? f.home_team_id : f.away_team_id;

      const ok = await upsertMatchStory(f.id, 'CRONICA', {
        title: `${home} ${f.home_score}-${f.away_score} ${away}`,
        original_title: pista,
        original_url: null,
        original_source: 'ManOfTheMatch',
        published_at: new Date().toISOString(),
        team_id: slugOrNull(winnerId),
        fixture_id: f.id,
        subject: (winnerId === f.home_team_id ? homeGoals : awayGoals)[0] ?? null,
        status: 'draft',
        image_state: 'pending',
      });
      if (ok) created++;
    }

    return created;
  });
}
