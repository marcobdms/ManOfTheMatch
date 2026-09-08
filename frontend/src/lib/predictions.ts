import type { MatchOdds, PredictionFact } from '../types/view'

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
  // Derivados de API-Football (backend/jobs/syncPredictions.ts · buildAfFacts).
  af_h2h: 'Cara a cara (últimos {2}): {0} {3}, {1} {4}, empates {5}.',
  af_form: 'Forma reciente — {0}: {1} · {2}: {3}.',
  af_goals: '{0} promedia {1} goles a favor y {2} en contra; {3}, {4} y {5}.',
}

/** "WWDLW" → "V V E D V" (los argumentos af_form vienen en inglés). */
function formToEs(s: string): string {
  return s
    .split('')
    .map((c) => (c === 'W' ? 'V' : c === 'D' ? 'E' : c === 'L' ? 'D' : c))
    .join(' ')
}

/** Traduce un argumento (Fotmob o API-Football), sustituyendo
 *  home_team/away_team por el nombre corto real. null si no se conoce. */
export function translateFact(fact: PredictionFact, homeName: string, awayName: string): string | null {
  const template = TEMPLATES[fact.templateId]
  if (!template) return null
  // af_form trae las rachas en inglés (WWDLW) en los índices 1 y 3.
  const formIdx = fact.templateId === 'af_form' ? new Set([1, 3]) : null
  return template.replace(/\{(\d+)\}/g, (_, i) => {
    const n = Number(i)
    const raw = fact.values[n]
    if (raw === 'home_team') return homeName
    if (raw === 'away_team') return awayName
    if (formIdx?.has(n) && raw) return formToEs(raw)
    return raw ?? ''
  })
}

/**
 * "Quién gana" a partir de las cuotas reales (implied probability = 1/cuota,
 * normalizada para quitar el margen de la casa), promediado entre casas.
 * Más fiable que el `percent` que da API-Football gratis — ese motor a
 * veces suelta cosas como 50/50/0% con un H2H claramente a favor de uno de
 * los dos (visto en producción con Barça–Rayo el 2026-08-30).
 */
export function impliedResultPercent(odds: MatchOdds[]): { home: number; draw: number; away: number } | null {
  if (!odds.length) return null
  const probs = odds.map((o) => {
    const h = 1 / o.home
    const d = 1 / o.draw
    const a = 1 / o.away
    const total = h + d + a
    return { home: h / total, draw: d / total, away: a / total }
  })
  const avg = (key: 'home' | 'draw' | 'away') => probs.reduce((sum, p) => sum + p[key], 0) / probs.length
  return {
    home: Math.round(avg('home') * 100),
    draw: Math.round(avg('draw') * 100),
    away: Math.round(avg('away') * 100),
  }
}
