import type { PredictionFact } from '../types/view'

// Plantillas verificadas contra datos reales de Fotmob (2026-08-30/31). Un
// TextTemplateId no listado aquí se omite — nunca se muestra en inglés ni se
// inventa una traducción para una plantilla no vista.
const TEMPLATES: Record<string, string> = {
  bad_form_team: '{0} ha perdido sus últimos {1} partidos.',
  h2h_undefeated: '{0} no ha perdido ante {1} en sus últimos {2} enfrentamientos ({3}V, {4}E).',
  goalstreak_team_home: '{0} ha marcado en sus últimos {1} partidos en casa.',
  goals_team: '{0} ha marcado {1} goles en sus últimos {2} partidos.',
  draw_streak_team: '{0} no ha empatado en sus últimos {1} partidos.',
  team_form_both: '{0}: {1}V-{2}E-{3}D en los últimos 5 · {4}: {5}V-{6}E-{7}D.',
  goals_total_last_3_both: '{0} ha marcado {3} goles en sus últimos {2} partidos, {1} ha marcado {4}.',
}

/** Traduce un argumento de Fotmob, sustituyendo home_team/away_team por el
 *  nombre corto real. Devuelve null si la plantilla no se conoce. */
export function translateFact(fact: PredictionFact, homeName: string, awayName: string): string | null {
  const template = TEMPLATES[fact.templateId]
  if (!template) return null
  return template.replace(/\{(\d+)\}/g, (_, i) => {
    const raw = fact.values[Number(i)]
    if (raw === 'home_team') return homeName
    if (raw === 'away_team') return awayName
    return raw ?? ''
  })
}
