// Últimos títulos de peso de cada club — dato curado a mano: ninguna de
// nuestras fuentes (football-data, api-football, fotmob, thesportsdb) da
// palmarés estructurado. Solo se listan clubes con algún título reciente
// relevante; el resto no muestra la sección.
//
// MANTENIMIENTO: al acabar cada temporada hay que añadir a mano los nuevos
// títulos aquí. Si esto crece, la alternativa es un resolutor de Wikidata
// (propiedad P166) como el de las fotos de jugador.

export type Honour = { year: number; title: string }

export const TEAM_HONOURS: Record<string, Honour[]> = {
  'real-madrid': [
    { year: 2024, title: 'Champions League' },
    { year: 2024, title: 'LaLiga' },
    { year: 2024, title: 'Supercopa de España' },
  ],
  barcelona: [
    { year: 2023, title: 'LaLiga' },
    { year: 2023, title: 'Supercopa de España' },
    { year: 2021, title: 'Copa del Rey' },
  ],
  'atletico-madrid': [
    { year: 2021, title: 'LaLiga' },
    { year: 2018, title: 'Europa League' },
  ],
  'athletic-bilbao': [
    { year: 2024, title: 'Copa del Rey' },
    { year: 2021, title: 'Supercopa de España' },
  ],
  'real-betis': [{ year: 2022, title: 'Copa del Rey' }],
  sevilla: [
    { year: 2023, title: 'Europa League' },
    { year: 2020, title: 'Europa League' },
  ],
  villarreal: [{ year: 2021, title: 'Europa League' }],
  valencia: [{ year: 2019, title: 'Copa del Rey' }],
  'real-sociedad': [{ year: 2021, title: 'Copa del Rey' }],
}

export function honoursFor(teamId: string | null | undefined): Honour[] {
  if (!teamId) return []
  return TEAM_HONOURS[teamId] ?? []
}
