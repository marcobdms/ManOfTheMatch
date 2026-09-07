// Ficha histórica de cada club: fundación, palmarés resumido y últimos
// títulos. Dato CURADO A MANO — ninguna de nuestras fuentes (football-data,
// api-football, fotmob, thesportsdb) da títulos, y Wikidata (P166) los tiene
// casi vacíos para los clubes de fútbol. Se comprobó.
//
// MANTENIMIENTO: al acabar cada temporada, añadir a mano los títulos nuevos
// en `recent` (y subir el contador en `titles`).

export type Honour = { year: number; title: string }

export type TeamFacts = {
  founded: number
  /** Contadores de títulos grandes, para la línea de palmarés. */
  titles?: { liga?: number; champions?: number; copa?: number; europa?: number }
  /** Últimos títulos relevantes, del más reciente al más antiguo. */
  recent: Honour[]
}

export const TEAM_FACTS: Record<string, TeamFacts> = {
  'real-madrid': {
    founded: 1902,
    titles: { liga: 36, champions: 15, copa: 20 },
    recent: [
      { year: 2024, title: 'Champions League' },
      { year: 2024, title: 'LaLiga' },
      { year: 2024, title: 'Supercopa de España' },
    ],
  },
  barcelona: {
    founded: 1899,
    titles: { liga: 27, champions: 5, copa: 31 },
    recent: [
      { year: 2023, title: 'LaLiga' },
      { year: 2023, title: 'Supercopa de España' },
      { year: 2021, title: 'Copa del Rey' },
    ],
  },
  'atletico-madrid': {
    founded: 1903,
    titles: { liga: 11, copa: 10, europa: 3 },
    recent: [
      { year: 2021, title: 'LaLiga' },
      { year: 2018, title: 'Europa League' },
    ],
  },
  'athletic-bilbao': {
    founded: 1898,
    titles: { liga: 8, copa: 24 },
    recent: [
      { year: 2024, title: 'Copa del Rey' },
      { year: 2021, title: 'Supercopa de España' },
    ],
  },
  valencia: {
    founded: 1919,
    titles: { liga: 6, copa: 8 },
    recent: [{ year: 2019, title: 'Copa del Rey' }],
  },
  'real-sociedad': {
    founded: 1909,
    titles: { liga: 2, copa: 3 },
    recent: [{ year: 2020, title: 'Copa del Rey' }],
  },
  sevilla: {
    founded: 1890,
    titles: { liga: 1, copa: 5, europa: 7 },
    recent: [{ year: 2023, title: 'Europa League' }],
  },
  'real-betis': {
    founded: 1907,
    titles: { liga: 1, copa: 3 },
    recent: [{ year: 2022, title: 'Copa del Rey' }],
  },
  villarreal: {
    founded: 1923,
    titles: { europa: 1 },
    recent: [{ year: 2021, title: 'Europa League' }],
  },
  espanyol: { founded: 1900, titles: { copa: 4 }, recent: [{ year: 2006, title: 'Copa del Rey' }] },
  deportivo: {
    founded: 1906,
    titles: { liga: 1, copa: 2 },
    recent: [{ year: 2002, title: 'Copa del Rey' }],
  },
  'celta-vigo': { founded: 1923, recent: [] },
  'rayo-vallecano': { founded: 1924, recent: [] },
  osasuna: { founded: 1920, recent: [] },
  getafe: { founded: 1983, recent: [] },
  alaves: { founded: 1921, recent: [] },
  levante: { founded: 1909, recent: [] },
  elche: { founded: 1923, recent: [] },
  'racing-santander': { founded: 1913, recent: [] },
  malaga: { founded: 1904, recent: [] },
}

export function factsFor(teamId: string | null | undefined): TeamFacts | null {
  if (!teamId) return null
  return TEAM_FACTS[teamId] ?? null
}

/** "36 Ligas · 15 Champions · 20 Copas" — línea corta de palmarés. */
export function palmaresLine(facts: TeamFacts): string {
  const t = facts.titles
  if (!t) return ''
  const parts: string[] = []
  if (t.liga) parts.push(`${t.liga} ${t.liga === 1 ? 'Liga' : 'Ligas'}`)
  if (t.champions) parts.push(`${t.champions} Champions`)
  if (t.copa) parts.push(`${t.copa} ${t.copa === 1 ? 'Copa' : 'Copas'}`)
  if (t.europa) parts.push(`${t.europa} Europa League`)
  return parts.join(' · ')
}
