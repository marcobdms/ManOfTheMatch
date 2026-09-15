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

/** No hay columna de competición en `news` para un vídeo (a diferencia de un
 *  fixture): se detecta por el título, que en los canales que cubrimos
 *  (TNT/DAZN/UEFA/CBS) siempre la nombra. */
const CHAMPIONS_RE = /champions league|uefa champions/i

/**
 * Sistema de prioridad del carrusel — dos palancas, para ir afinando:
 *  - CHAMPIONS_WEIGHT: empuja lo de Champions. Hoy escasea en el pool (recién
 *    se sumó el canal de TNT), así que necesita ayuda para no perderse entre
 *    el volumen de LaLiga.
 *  - TEAM_WEIGHT: empuja a los grandes de LaLiga (mismo criterio que
 *    `generateOwnNews.ts` en el backend).
 * Se suman: un vídeo puede ser de Champions Y de un equipo grande a la vez
 * (Real Madrid-Inter) y saca las dos. Subir/bajar estos números es la forma
 * más simple de reordenar el carrusel sin tocar la lógica de abajo.
 */
const CHAMPIONS_WEIGHT = 3
const TEAM_WEIGHT = 1

function priorityScore(item: NewsItem): number {
  let score = 0
  if (CHAMPIONS_RE.test(item.title)) score += CHAMPIONS_WEIGHT
  if (item.teamId && IMPORTANT_TEAM_IDS.has(item.teamId)) score += TEAM_WEIGHT
  return score
}

/** Hasta `max` vídeos para el carrusel: por prioridad (ver `priorityScore`),
 *  y sin repetir equipo mientras el resto del pool dé variedad — así no
 *  salen 4 seguidos del Madrid y nada más. Si no hay suficiente variedad
 *  para llegar a `max`, se rellena repitiendo equipo (2ª pasada) — pero una
 *  "Rueda de prensa" de un equipo que ya tiene la suya no se repite NUNCA,
 *  ni en el relleno: es el tipo de vídeo que más se repite en los canales
 *  oficiales (varios clips de la misma comparecencia) y es justo lo que no
 *  se quiere ver dos veces seguidas en el carrusel. */
export function pickHighlights(items: NewsItem[], max: number): NewsItem[] {
  const sorted = [...items].sort((a, b) => priorityScore(b) - priorityScore(a))
  const isPress = (it: NewsItem) => contentKind(it.title) === 'Rueda de prensa'

  const picked: NewsItem[] = []
  const seenTeam = new Set<string>()
  const seenPressTeam = new Set<string>()

  for (const it of sorted) {
    if (picked.length >= max) break
    if (it.teamId && seenTeam.has(it.teamId)) continue
    picked.push(it)
    if (it.teamId) {
      seenTeam.add(it.teamId)
      if (isPress(it)) seenPressTeam.add(it.teamId)
    }
  }
  if (picked.length < max) {
    for (const it of sorted) {
      if (picked.length >= max) break
      if (picked.includes(it)) continue
      if (it.teamId && isPress(it) && seenPressTeam.has(it.teamId)) continue
      picked.push(it)
      if (it.teamId && isPress(it)) seenPressTeam.add(it.teamId)
    }
  }
  return picked
}
