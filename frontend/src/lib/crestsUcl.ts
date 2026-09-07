// Escudos de los clubes de la fase liga de Champions. Las filas de
// `standings` para 'ucl' casi no traen `team_id` (solo los clubes españoles),
// así que aquí el escudo se busca por el NOMBRE que da la fuente
// (football-data.org), no por slug.
//
// Los SVG están en assets/crests/ucl/ salvo los 5 clubes de LaLiga que ya
// teníamos (Madrid, Barça, Atleti, Betis, Villarreal): esos se reutilizan de
// crests.ts para no duplicar el archivo.
import { crestFor } from './crests'

const uclFiles = import.meta.glob('../assets/crests/ucl/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

/** basename sin extensión -> url */
const UCL: Record<string, string> = {}
for (const [path, url] of Object.entries(uclFiles)) {
  const key = path.split('/').pop()!.replace(/\.svg$/, '')
  UCL[key] = url
}

/** Nombre exacto de football-data.org -> archivo (o slug de LaLiga). */
const NAME_TO_CREST: Record<string, string> = {
  'Club Brugge KV': 'club-brugge',
  'Aston Villa FC': 'aston-villa',
  'PAE AEK': 'aek-athens',
  'LASK Linz': 'lask',
  'Real Madrid CF': 'laliga:real-madrid',
  'FC Internazionale Milano': 'inter-milan',
  'FC Porto': 'fc-porto',
  'Manchester City FC': 'manchester-city',
  'Borussia Dortmund': 'borussia-dortmund',
  'Villarreal CF': 'laliga:villarreal',
  'Lille OSC': 'losc-lille',
  'Real Betis Balompié': 'laliga:real-betis',
  'FC Barcelona': 'laliga:barcelona',
  'Feyenoord Rotterdam': 'feyenoord',
  'VfB Stuttgart': 'vfb-stuttgart',
  'Viking FK': 'viking-fk',
  'Liverpool FC': 'liverpool-fc',
  'Club Atlético de Madrid': 'laliga:atletico-madrid',
  'Paris Saint-Germain FC': 'paris-saint-germain-psg',
  'SSC Napoli': 'napoli',
  'Arsenal FC': 'arsenal',
  'Sporting Clube de Portugal': 'sporting-cp',
  'Galatasaray SK': 'galatasaray',
  'Fenerbahçe SK': 'fenerbahce',
  'AS Roma': 'roma',
  PSV: 'psv-eindhoven',
  'FK Shakhtar Donetsk': 'shakhtar-donetsk',
  'FC Bayern München': 'bayern-munich',
  'FK Bodø/Glimt': 'fk-bodo-glimt',
  'Manchester United FC': 'manchester-united',
  'Sabah FK': 'sabah-fk',
  'Como 1907': 'como-1907',
  'RB Leipzig': 'rb-leipzig',
  'SK Slavia Praha': 'slavia-praha',
  'Racing Club de Lens': 'rc-lens',
  'ŠK Slovan Bratislava': 'slovan-bratislava',
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\b(fc|cf|sk|kv|fk|ssc|as|pae|rc|club|balompie|de|the)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

// Índice normalizado para tolerar pequeñas variaciones de la fuente.
const NORM_INDEX: Record<string, string> = {}
for (const [name, crest] of Object.entries(NAME_TO_CREST)) NORM_INDEX[norm(name)] = crest

function resolve(crest: string | undefined): string | null {
  if (!crest) return null
  if (crest.startsWith('laliga:')) return crestFor(crest.slice('laliga:'.length))
  return UCL[crest] ?? null
}

/** Escudo de un club de Champions por el nombre que da la clasificación. */
export function crestForUclTeam(teamName: string | null | undefined): string | null {
  if (!teamName) return null
  return resolve(NAME_TO_CREST[teamName]) ?? resolve(NORM_INDEX[norm(teamName)])
}
