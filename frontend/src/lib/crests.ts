// Escudos SVG de los 20 clubes (frontend/src/assets/crests/*.svg).
import alaves from '../assets/crests/alaves.svg'
import athleticBilbao from '../assets/crests/athletic-bilbao.svg'
import atleticoMadrid from '../assets/crests/atletico-madrid.svg'
import barcelona from '../assets/crests/barcelona.svg'
import celtaVigo from '../assets/crests/celta-vigo.svg'
import deportivo from '../assets/crests/deportivo.svg'
import elche from '../assets/crests/elche.svg'
import espanyol from '../assets/crests/espanyol.svg'
import getafe from '../assets/crests/getafe.svg'
import levante from '../assets/crests/levante.svg'
import malaga from '../assets/crests/malaga.svg'
import osasuna from '../assets/crests/osasuna.svg'
import racingSantander from '../assets/crests/racing-santander.svg'
import rayoVallecano from '../assets/crests/rayo-vallecano.svg'
import realBetis from '../assets/crests/real-betis.svg'
import realMadrid from '../assets/crests/real-madrid.svg'
import realSociedad from '../assets/crests/real-sociedad.svg'
import sevilla from '../assets/crests/sevilla.svg'
import valencia from '../assets/crests/valencia.svg'
import villarreal from '../assets/crests/villarreal.svg'

const CRESTS: Partial<Record<string, string>> = {
  alaves,
  'athletic-bilbao': athleticBilbao,
  'atletico-madrid': atleticoMadrid,
  barcelona,
  'celta-vigo': celtaVigo,
  deportivo,
  elche,
  espanyol,
  getafe,
  levante,
  malaga,
  osasuna,
  'racing-santander': racingSantander,
  'rayo-vallecano': rayoVallecano,
  'real-betis': realBetis,
  'real-madrid': realMadrid,
  'real-sociedad': realSociedad,
  sevilla,
  valencia,
  villarreal,
}

export function crestFor(teamId: string | null | undefined): string | null {
  if (!teamId) return null
  return CRESTS[teamId] ?? null
}
