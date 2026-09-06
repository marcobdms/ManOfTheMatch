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

/** Inserta si no existía ya una noticia para ese partido y tema. */
async function insertDraft(row: Record<string, unknown>): Promise<boolean> {
  const { data, error } = await db
    .from('news')
    .upsert(row, { onConflict: 'url', ignoreDuplicates: true })
    .select('id');
  if (error) {
    console.error('[generateOwnNews] insert falló', error);
    return false;
  }
  return (data?.length ?? 0) > 0;
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
      const { data: scorers } = await db
        .from('match_events')
        .select('player_name')
        .eq('fixture_id', f.id)
        .in('type', ['GOAL', 'PENALTY_GOAL', 'OWN_GOAL'])
        .limit(10);
      const names = [...new Set((scorers ?? []).map((s: { player_name: string | null }) => s.player_name).filter(Boolean))];

      const ok = await insertDraft({
        title: `${home} ${f.home_score}-${f.away_score} ${away}`,
        original_title:
          `El ${home} y el ${away} terminan ${f.home_score}-${f.away_score}` +
          (names.length ? `. Goles de ${names.join(', ')}` : ''),
        url: `motm://cronica/${f.id}`,
        original_url: null,
        original_source: 'ManOfTheMatch',
        published_at: new Date().toISOString(),
        team_id: f.home_score >= f.away_score ? f.home_team_id : f.away_team_id,
        fixture_id: f.id,
        topic: 'CRONICA',
        subject: names[0] ?? null,
        status: 'draft',
        image_state: 'pending',
      });
      if (ok) created++;
    }

    return created;
  });
}
