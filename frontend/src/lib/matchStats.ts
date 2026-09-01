// Traducción y formato de la comparativa de equipo de Fotmob
// (`match_team_stats`, escrita por backend/src/jobs/syncMatchFacts.ts).
//
// Fotmob manda los títulos en inglés y con formatos mezclados: números
// ("26"), decimales como texto ("3.04") y compuestos ("585 (90%)"). Aquí se
// normaliza todo a un número comparable (para las barras) conservando el
// texto original cuando dice más que el número suelto.

/** Clave estable de Fotmob → etiqueta en español. Lo que no esté aquí se
 *  muestra con su título original en vez de descartarlo. */
const STAT_LABEL: Record<string, string> = {
  BallPossesion: 'Posesión',
  expected_goals: 'Goles esperados (xG)',
  expected_goals_open_play: 'xG en juego abierto',
  expected_goals_set_play: 'xG a balón parado',
  expected_goals_non_penalty: 'xG sin penaltis',
  expected_goals_on_target: 'xG a puerta (xGOT)',
  total_shots: 'Tiros totales',
  ShotsOnTarget: 'Tiros a puerta',
  ShotsOffTarget: 'Tiros fuera',
  blocked_shots: 'Tiros bloqueados',
  shots_woodwork: 'Al palo',
  shots_inside_box: 'Tiros dentro del área',
  shots_outside_box: 'Tiros desde fuera',
  big_chance: 'Ocasiones claras',
  big_chance_missed_title: 'Ocasiones claras falladas',
  touches_opp_box: 'Toques en el área rival',
  corners: 'Córners',
  passes: 'Pases',
  accurate_passes: 'Pases completados',
  own_half_passes: 'Pases en campo propio',
  opposition_half_passes: 'Pases en campo rival',
  long_balls_accurate: 'Balones largos completados',
  accurate_crosses: 'Centros completados',
  player_throws: 'Saques de banda',
  Offsides: 'Fueras de juego',
  'matchstats.headers.tackles': 'Entradas',
  interceptions: 'Intercepciones',
  shot_blocks: 'Bloqueos',
  clearances: 'Despejes',
  keeper_saves: 'Paradas del portero',
  duel_won: 'Duelos ganados',
  ground_duels_won: 'Duelos en el suelo',
  aerials_won: 'Duelos aéreos',
  dribbles_succeeded: 'Regates completados',
  yellow_cards: 'Tarjetas amarillas',
  red_cards: 'Tarjetas rojas',
  fouls: 'Faltas cometidas',
}

/** Título del grupo en inglés → español. */
const GROUP_LABEL: Record<string, string> = {
  'Top stats': 'Resumen',
  Shots: 'Tiros',
  'Expected goals (xG)': 'Goles esperados',
  Passes: 'Pases',
  Defence: 'Defensa',
  Duels: 'Duelos',
  Discipline: 'Disciplina',
}

/** Orden de los bloques: lo más contado primero. */
const GROUP_ORDER = ['Top stats', 'Expected goals (xG)', 'Shots', 'Passes', 'Duels', 'Defence', 'Discipline']

const DECIMAL_KEYS = new Set([
  'expected_goals',
  'expected_goals_open_play',
  'expected_goals_set_play',
  'expected_goals_non_penalty',
  'expected_goals_on_target',
])

export function statLabel(key: string | null, fallbackTitle: string): string {
  return (key && STAT_LABEL[key]) || fallbackTitle
}

export function groupLabel(title: string): string {
  return GROUP_LABEL[title] ?? title
}

export function groupRank(title: string): number {
  const i = GROUP_ORDER.indexOf(title)
  return i === -1 ? GROUP_ORDER.length : i
}

export function isDecimalStat(key: string | null): boolean {
  return !!key && DECIMAL_KEYS.has(key)
}

/** "585 (90%)" → 585 · "3.04" → 3.04 · 26 → 26. null si no hay número. */
export function statNumber(raw: string | null): number | null {
  if (raw == null) return null
  const match = raw.match(/-?\d+(?:[.,]\d+)?/)
  if (!match) return null
  const n = Number(match[0].replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** true si el valor trae un porcentaje dentro ("585 (90%)"), que merece
 *  enseñarse tal cual en vez de solo el número. */
export function hasInlinePercent(raw: string | null): boolean {
  return !!raw && /\(\d+%\)/.test(raw)
}
