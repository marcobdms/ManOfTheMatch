// Color dominante del escudo de cada club — es el fondo de la carta cuando una
// noticia no tiene foto libre (que es el caso más común, ver
// backend/src/sources/wikimedia.ts). Sobre él va siempre un velo oscuro en CSS,
// así que los amarillos y azules claros siguen dejando leer el titular.
import type { TeamId } from './shared'

export const TEAM_COLOR: Record<TeamId, string> = {
  'real-madrid': '#00529F',
  barcelona: '#A50044',
  'atletico-madrid': '#CB3524',
  'athletic-bilbao': '#EE2523',
  villarreal: '#E8B600',
  'real-betis': '#00954C',
  'celta-vigo': '#6FB1E0',
  'rayo-vallecano': '#E53027',
  osasuna: '#0A346F',
  'real-sociedad': '#0067B1',
  sevilla: '#D81920',
  valencia: '#F18E00',
  getafe: '#005999',
  alaves: '#0761AF',
  espanyol: '#007FC8',
  levante: '#0857A6',
  elche: '#00913F',
  'racing-santander': '#009B48',
  deportivo: '#0055A5',
  malaga: '#0080C8',
}

/** Color primario aproximado de los clubes de Champions (sin fila en `teams`
 *  con `primary_color`). Solo se usa como fondo con velo oscuro — no hace
 *  falta que sea exacto. */
const UCL_TEAM_COLOR: Record<string, string> = {
  'aek-athens': '#F5C400',
  arsenal: '#EF0107',
  roma: '#8E1F2F',
  'aston-villa': '#670E36',
  'bayern-munich': '#DC052D',
  'borussia-dortmund': '#F5C518',
  'club-brugge': '#003DA5',
  'como-1907': '#004B87',
  'fc-porto': '#00428C',
  fenerbahce: '#00398D',
  feyenoord: '#C40018',
  'fk-bodo-glimt': '#F9D616',
  galatasaray: '#7B0323',
  'inter-milan': '#0B1F8F',
  lask: '#C8102E',
  'losc-lille': '#E01E13',
  'liverpool-fc': '#C8102E',
  'manchester-city': '#6CABDD',
  'manchester-united': '#DA291C',
  'paris-saint-germain-psg': '#0A1E4A',
  'psv-eindhoven': '#ED1C24',
  'rb-leipzig': '#DA291C',
  'rc-lens': '#E30613',
  'sabah-fk': '#009C4E',
  'shakhtar-donetsk': '#F47B20',
  'slavia-praha': '#D7141A',
  'slovan-bratislava': '#0F3C8C',
  'sporting-cp': '#008057',
  napoli: '#12A0D7',
  'vfb-stuttgart': '#E32219',
  'viking-fk': '#003C77',
}

export function teamColor(teamId: string | null | undefined): string {
  if (!teamId) return 'var(--muted)'
  return TEAM_COLOR[teamId as TeamId] ?? UCL_TEAM_COLOR[teamId] ?? 'var(--muted)'
}
