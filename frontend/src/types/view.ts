import type { MatchEventType, MatchStatus } from '../lib/shared'

export type TeamLite = {
  id: string
  tla: string
  name: string
  /** Nombre corto para UI apretada ("Betis" en vez de "Real Betis Balompié"). */
  shortName: string
}

export type LiveMatch = {
  id: string
  competitionShort: string
  status: MatchStatus
  minuteLabel: string // "74'" — fallback estático si no hay ancla de reloj nativo
  /** Ancla del reloj nativo (liveLoop.ts): con esto + `halfNumber` el cliente
   *  calcula el minuto en vivo segundo a segundo, sin repreguntar al backend
   *  en cada tick. `null` si el partido no está LIVE o aún no hay ancla. */
  halfStartedAt: string | null
  halfNumber: number | null
  kickoffAt: string // ISO timestamp, from fixtures.kickoff_at
  home: TeamLite
  away: TeamLite
  homeScore: number
  awayScore: number
}

/** A fixture that hasn't kicked off yet — used by Home y Próximos. */
export type UpcomingMatch = {
  id: string
  competitionShort: string
  kickoffAt: string
  matchday: number | null
  home: TeamLite
  away: TeamLite
}

/** One row of a league table snapshot (`standings`, latest `captured_at`). */
export type StandingRow = {
  teamId: string | null
  teamName: string
  tla: string | null
  position: number
  played: number | null
  points: number | null
}

/** One `news` row — tabla vacía hoy; Home la omite por completo si no hay filas. */
export type NewsItem = {
  id: string
  title: string
  summary: string | null
  url: string | null
  imageUrl: string | null
  publishedAt: string | null
}

export type GoalChip = {
  minuteLabel: string
  player: string
}

/** Una fila de `player_match_stats` — solo existe post-partido (sync de
 *  API-Football), nunca inventada para un partido sin datos aún. */
export type PlayerStat = {
  playerName: string
  teamId: string
  minutes: number | null
  rating: number | null
  goals: number
  assists: number
  shots: number
  shotsOn: number
  passes: number
  passAccuracy: number | null
  tackles: number
}

export type TimelineEvent = {
  id: string
  type: MatchEventType
  minuteLabel: string
  text: string
}

/** Un jugador dentro de `team_lineup_snapshots.players` (contrato con el
 *  backend — ver supabase/migrations/0005_lineups_players.sql y
 *  backend/src/jobs/syncLineups.ts). No cambiar la forma sin avisar. */
export type LineupPlayer = {
  name: string
  shortName: string
  number: number | null
  position: string | null
  x: number // 0..1, 0 = línea de fondo propia
  y: number // 0..1, 0 = banda izquierda
  age: number | null
  country: string | null
  countryCode: string | null
  rating: number | null
  seasonRating: number | null
  isStarter: boolean
  photoUrl: string | null
}

export type LineupFreshness = 'confirmed' | 'predicted' | 'last_played'

export type TeamLineupSnapshot = {
  teamId: string
  opponentName: string | null
  opponentCrest: string | null
  isHome: boolean | null
  kickoffAt: string | null
  formation: string | null
  coach: string | null
  lineupType: LineupFreshness
  players: LineupPlayer[]
  updatedAt: string
}

// ---- Estadísticas ampliadas del partido (pendiente de ingesta del Agente A) ----
// Tablas todavía no confirmadas — ver docs/plan-2026-08-29.md. Los hooks que
// consumen estos tipos (lib/queries.ts) toleran que la tabla no exista aún.

/** Un punto del gráfico de momentum: +valor domina el local, -valor el visitante. */
export type MomentumPoint = {
  minute: number
  value: number
}

/** Periodo al que se refiere una comparativa de equipo. */
export type StatPeriod = 'total' | 'first' | 'second'

/** Un par local/visitante para una métrica concreta, de `match_team_stats`. */
export type TeamStatPair = {
  key: string // ej. 'possession', 'shots', 'xg'
  label: string
  home: number
  away: number
  /** true → mostrar con un decimal (xG); false → entero (tiros, pases...) */
  isDecimal?: boolean
  /** true → valor en porcentaje (posesión, precisión de pase) */
  isPercent?: boolean
}

/** Comparativa de equipo completa de un partido, ya separada por periodo. */
export type TeamStatsComparison = {
  [period in StatPeriod]: TeamStatPair[]
}

export type ShotType = 'Goal' | 'Miss' | 'AttemptSaved' | 'Post'
export type ShotSituation = 'RegularPlay' | 'FromCorner' | 'SetPiece' | 'FreeKick' | 'FastBreak'

/** Una fila de `match_shots` (supabase/migrations/0008_shot_events.sql). */
export type MatchShot = {
  id: string
  minute: number
  teamId: string
  playerName: string
  type: ShotType
  situation: ShotSituation | null
  isOnTarget: boolean
  isBlocked: boolean
  xg: number | null
}

/** Cuota 1X2 de una casa (supabase/migrations/0010_predictions.sql). */
export type MatchOdds = {
  bookmakerId: number
  bookmakerName: string
  home: number
  draw: number
  away: number
}

/** Un argumento de Fotmob, aun sin traducir — ver lib/predictions.ts. */
export type PredictionFact = {
  templateId: string
  values: string[]
}

/** Previsión pre-partido de un fixture. Todo nullable — nunca se inventa un
 *  dato que la fuente no dio. */
export type MatchPrediction = {
  percentHome: number | null
  percentDraw: number | null
  percentAway: number | null
  formHome: number | null
  formAway: number | null
  attHome: number | null
  attAway: number | null
  defHome: number | null
  defAway: number | null
  facts: PredictionFact[]
}
