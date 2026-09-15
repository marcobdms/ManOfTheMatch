import type { NewsItem } from '../types/view'

/** Mismo criterio que `generateOwnNews.ts` en el backend para priorizar: los
 *  grandes primero. Duplicado a mano igual que el resto de listas de
 *  equipos — ver CLAUDE.md. */
const IMPORTANT_TEAM_IDS = new Set([
  'real-madrid',
  'barcelona',
  'atletico-madrid',
  'athletic-bilbao',
  'sevilla',
  'valencia',
  'real-sociedad',
  'real-betis',
  'villarreal',
])

/** Qué tipo de vídeo es, a partir del título — solo para el párrafo del
 *  carrusel, no se manda nada de esto a Groq (los vídeos no pasan por ahí,
 *  ver newsWriter.ts). */
export function contentKind(title: string): string {
  const t = title.toLowerCase()
  if (/rueda de prensa|press conference/.test(t)) return 'Rueda de prensa'
  if (/entrevista|interview/.test(t)) return 'Entrevista'
  if (/all goals|goles de la jornada|todos los goles/.test(t)) return 'Goles de la jornada'
  if (/previa|preview/.test(t)) return 'Previa'
  if (/resumen|highlights?/.test(t)) return 'Resumen'
  return 'Vídeo'
}

/** Hasta `max` vídeos para el carrusel: equipos grandes primero, y sin
 *  repetir equipo mientras el resto del pool dé variedad — así no salen 4
 *  seguidos del Madrid y nada más. Si no hay suficiente variedad para llegar
 *  a `max`, se rellena repitiendo equipo antes que dejar huecos vacíos. */
export function pickHighlights(items: NewsItem[], max: number): NewsItem[] {
  const sorted = [...items].sort((a, b) => {
    const pa = a.teamId && IMPORTANT_TEAM_IDS.has(a.teamId) ? 0 : 1
    const pb = b.teamId && IMPORTANT_TEAM_IDS.has(b.teamId) ? 0 : 1
    return pa - pb
  })

  const picked: NewsItem[] = []
  const seenTeam = new Set<string>()
  for (const it of sorted) {
    if (picked.length >= max) break
    if (it.teamId && seenTeam.has(it.teamId)) continue
    picked.push(it)
    if (it.teamId) seenTeam.add(it.teamId)
  }
  if (picked.length < max) {
    for (const it of sorted) {
      if (picked.length >= max) break
      if (picked.includes(it)) continue
      picked.push(it)
    }
  }
  return picked
}
