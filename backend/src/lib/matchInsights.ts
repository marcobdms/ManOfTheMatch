/**
 * Motor de "momentos" del partido: detecta patrones reales en los datos que ya
 * tenemos (momentum minuto a minuto, disparos con xG, comparativa por parte,
 * goles) y los convierte en disparadores para el narrador.
 *
 * La idea es la de un comentarista de videojuego: no narrar cada disparo, sino
 * saltar cuando pasa algo que merece comentario — un asedio, una parada
 * salvadora, una remontada.
 *
 * Todo lo que sale de aquí está respaldado por un número real; nunca se
 * describe CÓMO fue la jugada (eso no lo da ninguna fuente), solo qué pasó y
 * cuánto. Es una función pura: mismos datos, mismos momentos.
 */

export type InsightKind =
  | 'siege' // asedio sostenido segun el momentum
  | 'barrage' // varios disparos en pocos minutos sin marcar
  | 'big_save' // parada a un remate de xG alto
  | 'possession_half' // posesion aplastante al descanso
  | 'comeback' // le da la vuelta al marcador

export type MatchInsight = {
  kind: InsightKind
  minute: number
  /** Equipo protagonista (slug). En `big_save` es quien PARÓ. */
  teamId: string | null
  /** Datos reales que justifican el momento — van al narrador tal cual. */
  facts: Record<string, string | number | null>
}

export type InsightInput = {
  homeTeamId: string | null
  awayTeamId: string | null
  momentum: Array<{ minute: number; value: number }>
  shots: Array<{
    minute: number | null
    teamId: string | null
    playerName: string | null
    eventType: string
    expectedGoals: number | null
  }>
  goals: Array<{ minute: number | null; teamId: string | null }>
  /** Posesión de la 1ª parte, si está: [local, visitante]. */
  firstHalfPossession: [number, number] | null
}

// --- Umbrales, calibrados con momentum real de LaLiga -----------------------
// El momentum va de -100 (dominio visitante) a +100 (dominio local), un punto
// por minuto. En un partido real la mediana de |valor| ronda 29 y el p90 ~71,
// así que 55 sostenido durante 4 minutos ya es un tramo de dominio claro y no
// el vaivén normal.
const SIEGE_VALUE = 55
const SIEGE_MINUTES = 4
const BARRAGE_SHOTS = 4
const BARRAGE_WINDOW_MIN = 6
const BIG_SAVE_XG = 0.3
const POSSESSION_DOMINANT = 62
/** Dos momentos del mismo tipo no pueden ir pegados: satura el histórico. */
const MIN_GAP_MIN = 12
/** Ni dos de tipos distintos en el mismo minuto ("asedio" + "sin premio" en
 *  el 39' contaban lo mismo con otras palabras). */
const MIN_ANY_GAP_MIN = 5

function teamOf(input: InsightInput, side: 'home' | 'away'): string | null {
  return side === 'home' ? input.homeTeamId : input.awayTeamId
}

/** Tramos seguidos en los que el momentum se queda de un lado. */
function detectSieges(input: InsightInput): MatchInsight[] {
  const out: MatchInsight[] = []
  let runSide: 'home' | 'away' | null = null
  let runStart = 0
  let runLength = 0
  let runPeak = 0

  const flush = (endMinute: number) => {
    if (runSide && runLength >= SIEGE_MINUTES) {
      out.push({
        kind: 'siege',
        minute: endMinute,
        teamId: teamOf(input, runSide),
        facts: { desde: runStart, hasta: endMinute, minutos: runLength, intensidad_max: Math.round(runPeak) },
      })
    }
    runSide = null
    runLength = 0
    runPeak = 0
  }

  for (const point of [...input.momentum].sort((a, b) => a.minute - b.minute)) {
    const side: 'home' | 'away' | null =
      point.value >= SIEGE_VALUE ? 'home' : point.value <= -SIEGE_VALUE ? 'away' : null

    if (side === null || side !== runSide) {
      flush(point.minute - 1)
      if (side) {
        runSide = side
        runStart = point.minute
        runLength = 1
        runPeak = Math.abs(point.value)
      }
      continue
    }
    runLength++
    runPeak = Math.max(runPeak, Math.abs(point.value))
  }
  flush(input.momentum.length ? Math.max(...input.momentum.map((m) => m.minute)) : 0)
  return out
}

/** Varios remates del mismo equipo en pocos minutos sin que entrara ninguno. */
function detectBarrages(input: InsightInput): MatchInsight[] {
  const out: MatchInsight[] = []
  const shots = input.shots
    .filter((s) => s.minute != null && s.teamId)
    .sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0))

  for (const teamId of [input.homeTeamId, input.awayTeamId]) {
    if (!teamId) continue
    const own = shots.filter((s) => s.teamId === teamId)
    for (let i = 0; i + BARRAGE_SHOTS - 1 < own.length; i++) {
      const first = own[i]
      const last = own[i + BARRAGE_SHOTS - 1]
      if (!first || !last) continue
      const from = first.minute ?? 0
      const to = last.minute ?? 0
      if (to - from > BARRAGE_WINDOW_MIN) continue

      // Si en ese tramo marcó, no es una racha estéril: es un gol, y ese ya se
      // narra por su cuenta.
      const scored = dedupeGoals(input.goals).some(
        (g) => g.teamId === teamId && g.minute != null && g.minute >= from && g.minute <= to + 1,
      )
      if (scored) continue

      const span = to - from
      out.push({
        kind: 'barrage',
        minute: to,
        teamId,
        facts: {
          disparos: BARRAGE_SHOTS,
          desde: from,
          hasta: to,
          // Ya redactado: `to - from` puede ser 0 y quedaba "en apenas 0 minutos".
          ventana: span <= 1 ? 'en un suspiro' : `en ${span} minutos`,
        },
      })
      i += BARRAGE_SHOTS - 1 // no solapar rachas
    }
  }
  return out
}

/** Remate claro que el portero sacó. El protagonista es quien defendía. */
function detectBigSaves(input: InsightInput): MatchInsight[] {
  return input.shots
    .filter(
      (s) =>
        s.eventType === 'AttemptSaved' &&
        s.minute != null &&
        (s.expectedGoals ?? 0) >= BIG_SAVE_XG,
    )
    .map((s) => {
      const shooterIsHome = s.teamId === input.homeTeamId
      return {
        kind: 'big_save' as const,
        minute: s.minute!,
        teamId: shooterIsHome ? input.awayTeamId : input.homeTeamId,
        facts: { rematador: s.playerName, xg: s.expectedGoals, equipo_rematador: s.teamId },
      }
    })
}

function detectPossession(input: InsightInput): MatchInsight[] {
  const p = input.firstHalfPossession
  if (!p) return []
  const [home, away] = p
  if (home >= POSSESSION_DOMINANT) {
    return [{ kind: 'possession_half', minute: 45, teamId: input.homeTeamId, facts: { posesion: home } }]
  }
  if (away >= POSSESSION_DOMINANT) {
    return [{ kind: 'possession_half', minute: 45, teamId: input.awayTeamId, facts: { posesion: away } }]
  }
  return []
}

/**
 * El mismo gol llega por varias fuentes (fotmob y espn escriben cada uno su
 * fila en `match_events`), así que contar filas daba marcadores imposibles —
 * un 5-2 real salía como "5-4" tras contar 25 goles. Se cuenta una sola vez
 * por minuto y equipo.
 */
function dedupeGoals(goals: InsightInput['goals']): InsightInput['goals'] {
  const seen = new Set<string>()
  const out: InsightInput['goals'] = []
  for (const g of goals) {
    if (g.minute == null || !g.teamId) continue
    const key = `${g.teamId}:${g.minute}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(g)
  }
  return out
}

/** Un equipo que iba por detrás se pone por delante. */
function detectComeback(input: InsightInput): MatchInsight[] {
  const goals = dedupeGoals(input.goals).sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0))

  let home = 0
  let away = 0
  let leader: string | null = null
  let hadTrailed = new Set<string>()
  const out: MatchInsight[] = []

  for (const g of goals) {
    if (g.teamId === input.homeTeamId) home++
    else away++

    const newLeader = home > away ? input.homeTeamId : away > home ? input.awayTeamId : null
    const behind = home > away ? input.awayTeamId : away > home ? input.homeTeamId : null
    if (behind) hadTrailed.add(behind)

    // Se pone por delante alguien que antes iba perdiendo → remontada.
    if (newLeader && newLeader !== leader && hadTrailed.has(newLeader)) {
      out.push({
        kind: 'comeback',
        minute: g.minute!,
        teamId: newLeader,
        facts: { marcador: `${home}-${away}` },
      })
    }
    leader = newLeader
  }
  return out
}

/** Todos los momentos del partido, ordenados y sin amontonarse. */
export function detectInsights(input: InsightInput, maxInsights = 6): MatchInsight[] {
  const all = [
    ...detectSieges(input),
    ...detectBarrages(input),
    ...detectBigSaves(input),
    ...detectPossession(input),
    ...detectComeback(input),
  ].sort((a, b) => a.minute - b.minute)

  // Una remontada siempre entra; el resto compite por hueco.
  const kept: MatchInsight[] = []
  const lastByKind = new Map<InsightKind, number>()
  let lastAny = Number.NEGATIVE_INFINITY
  for (const insight of all) {
    const last = lastByKind.get(insight.kind)
    if (last != null && insight.minute - last < MIN_GAP_MIN) continue
    // Una remontada nunca se descarta por cercanía: es el momento del partido.
    if (insight.kind !== 'comeback' && insight.minute - lastAny < MIN_ANY_GAP_MIN) continue
    kept.push(insight)
    lastByKind.set(insight.kind, insight.minute)
    lastAny = insight.minute
  }

  if (kept.length <= maxInsights) return kept
  const priority: InsightKind[] = ['comeback', 'big_save', 'siege', 'barrage', 'possession_half']
  return [...kept]
    .sort((a, b) => priority.indexOf(a.kind) - priority.indexOf(b.kind))
    .slice(0, maxInsights)
    .sort((a, b) => a.minute - b.minute)
}
