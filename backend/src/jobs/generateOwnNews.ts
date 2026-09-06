/**
 * Noticias escritas SOLO con datos nuestros — sin fuente externa, sin riesgo
 * de copiar a nadie y sin depender de que Marca publique. Cubre los tres temas
 * que ya tenemos en la base:
 *
 *   ONCE    — hay once inicial confirmado para un partido (lineups)
 *   PREVIA  — partido en las próximas 36h (fixtures + newsContext)
 *   CRONICA — partido recién terminado (marcador + goleadores)
 *
 * Se insertan como `draft` con la pista construida aquí; rewriteNews.ts les da
 * el titular y el párrafo, igual que a las del feed. `url` es sintética
 * (motm://) porque es unique en `news` y así la deduplicación vale para todo.
 */
import { db } from '../db.js';
import { withRun } from '../lib/run.js';
import { TEAM_NAME } from '../lib/newsTaxonomy.js';
import type { TeamId } from '../lib/shared.js';

const PREVIEW_WINDOW_H = 36;
const RECAP_WINDOW_H = 12;

type Fx = {
  id: string;
  home_team_id: string | null;
  away_team_id: string | null;
  kickoff_at: string;
  status: string;
  home_score: number | null;
  away_score: number | null;
};

const name = (id: string | null) => (id ? TEAM_NAME[id as TeamId] ?? id : 'rival');

/**
 * Inserta la noticia si es nueva. Si ya existía y SIGUE en draft, le refresca
 * la pista y los datos: entre pasada y pasada pueden confirmarse los onces de
 * una previa, o quedar goles registrados en una crónica. Una vez publicada no
 * se toca — ya la reescribió el modelo.
 */
async function insertDraft(row: Record<string, unknown>): Promise<boolean> {
  const { data: existing } = await db
    .from('news')
    .select('id, status')
    .eq('url', row.url as string)
    .maybeSingle();

  if (existing) {
    if ((existing as { status: string }).status === 'draft') {
      await db
        .from('news')
        .update({
          original_title: row.original_title,
          summary: row.summary ?? null,
          team_id: row.team_id,
          subject: row.subject,
          topic: row.topic,
        })
        .eq('id', (existing as { id: string }).id);
    }
    return false;
  }

  const { error } = await db.from('news').insert(row);
  if (error) {
    console.error('[generateOwnNews] insert falló', error);
    return false;
  }
  return true;
}

export function generateOwnNews() {
  return withRun('generateOwnNews', 'news', async () => {
    const now = Date.now();
    let created = 0;

    // --- PREVIA: partidos de las próximas 36h ---
    const { data: upcoming } = await db
      .from('fixtures')
      .select('id, home_team_id, away_team_id, kickoff_at, status, home_score, away_score')
      .eq('status', 'SCHEDULED')
      .gte('kickoff_at', new Date(now).toISOString())
      .lte('kickoff_at', new Date(now + PREVIEW_WINDOW_H * 3600_000).toISOString())
      .order('kickoff_at', { ascending: true })
      .limit(10);

    for (const f of (upcoming ?? []) as unknown as Fx[]) {
      const home = name(f.home_team_id);
      const away = name(f.away_team_id);
      const ok = await insertDraft({
        title: `Previa: ${home} - ${away}`,
        original_title: `${home} recibe al ${away} en LaLiga`,
        url: `motm://previa/${f.id}`,
        original_url: null,
        original_source: 'ManOfTheMatch',
        published_at: new Date().toISOString(),
        team_id: f.home_team_id,
        fixture_id: f.id,
        topic: 'PREVIA',
        subject: null,
        status: 'draft',
        image_state: 'pending',
      });
      if (ok) created++;
    }

    // --- ONCE: alineación confirmada de un partido próximo ---
    const fixtureIds = ((upcoming ?? []) as unknown as Fx[]).map((f) => f.id);
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
        const f = (upcoming as unknown as Fx[]).find((x) => x.id === fixtureId);
        if (!f) continue;
        const home = name(f.home_team_id);
        const away = name(f.away_team_id);
        const ok = await insertDraft({
          title: `Ya hay onces para el ${home} - ${away}`,
          original_title:
            `Confirmados los onces iniciales del ${home} - ${away}` +
            (info.formation ? ` (${home} sale con ${info.formation})` : ''),
          url: `motm://once/${fixtureId}`,
          original_url: null,
          original_source: 'ManOfTheMatch',
          published_at: new Date().toISOString(),
          team_id: f.home_team_id,
          fixture_id: fixtureId,
          topic: 'ONCE',
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
      .select('id, home_team_id, away_team_id, kickoff_at, status, home_score, away_score')
      .eq('status', 'FINISHED')
      .gte('kickoff_at', new Date(now - RECAP_WINDOW_H * 3600_000).toISOString())
      .order('kickoff_at', { ascending: false })
      .limit(10);

    for (const f of (finished ?? []) as unknown as Fx[]) {
      if (f.home_score == null || f.away_score == null) continue;
      const home = name(f.home_team_id);
      const away = name(f.away_team_id);
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

      const winnerId = draw ? f.home_team_id : homeWon ? f.home_team_id : f.away_team_id;
      const ws = Math.max(f.home_score, f.away_score);
      const ls = Math.min(f.home_score, f.away_score);

      const goalLine = (label: string, list: string[]) =>
        list.length ? ` Goles del ${label}: ${list.join(', ')}.` : '';

      const pista = draw
        ? `El ${home} y el ${away} empatan ${f.home_score}-${f.away_score} (el ${home} jugaba en casa).` +
          goalLine(home, homeGoals) +
          goalLine(away, awayGoals)
        : `El ${name(winnerId)} gana ${ws}-${ls} ${homeWon ? 'en casa al' : 'a domicilio al'} ${homeWon ? away : home}.` +
          goalLine(home, homeGoals) +
          goalLine(away, awayGoals);

      const ok = await insertDraft({
        title: `${home} ${f.home_score}-${f.away_score} ${away}`,
        original_title: pista,
        url: `motm://cronica/${f.id}`,
        original_url: null,
        original_source: 'ManOfTheMatch',
        published_at: new Date().toISOString(),
        team_id: winnerId,
        fixture_id: f.id,
        topic: 'CRONICA',
        subject: (winnerId === f.home_team_id ? homeGoals : awayGoals)[0] ?? null,
        status: 'draft',
        image_state: 'pending',
      });
      if (ok) created++;
    }

    return created;
  });
}
