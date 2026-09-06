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

export function teamColor(teamId: string | null | undefined): string {
  if (!teamId) return 'var(--muted)'
  return TEAM_COLOR[teamId as TeamId] ?? 'var(--muted)'
}
