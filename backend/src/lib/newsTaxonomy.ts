/**
 * Qué noticias entran y de qué van. Marca etiqueta equipos y personas en sus
 * `<category>`, pero NO el tipo de noticia, así que el tema lo ponemos aquí.
 *
 * Seis temas. Tres salen del feed (LESION/TECNICO/FICHAJES) y tres los
 * generamos de datos que ya están en Supabase (ONCE/PREVIA/CRONICA) — esos no
 * dependen de ninguna fuente externa. Lo que no encaja en ningún tema se
 * descarta antes de gastar una llamada a Groq: opinión, cantera, arbitrajes,
 * líos de directiva.
 */
import { TEAMS, type TeamId } from './shared.js';

export type NewsTopic = 'ONCE' | 'PREVIA' | 'CRONICA' | 'LESION' | 'TECNICO' | 'FICHAJES';

/** Temas que se generan de datos propios, sin fuente externa. */
export const OWN_TOPICS: NewsTopic[] = ['ONCE', 'PREVIA', 'CRONICA'];

export const TOPIC_LABEL: Record<NewsTopic, string> = {
  ONCE: 'Alineaciones',
  PREVIA: 'Previa',
  CRONICA: 'Crónica',
  LESION: 'Lesiones',
  TECNICO: 'Decisión del técnico',
  FICHAJES: 'Fichajes',
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

/** Cómo llama Marca a cada club en sus `<category>` — no coincide con
 *  `TEAMS[].name` ("Athletic de Bilbao" vs "Athletic Club"). */
const TEAM_ALIASES: Record<string, TeamId> = {};
function alias(teamId: TeamId, ...names: string[]) {
  for (const n of names) TEAM_ALIASES[norm(n)] = teamId;
}
alias('real-madrid', 'Real Madrid', 'Real Madrid CF');
alias('barcelona', 'FC Barcelona', 'Barcelona', 'Barça');
alias('atletico-madrid', 'Atlético de Madrid', 'Atletico de Madrid', 'Atlético');
alias('athletic-bilbao', 'Athletic de Bilbao', 'Athletic Club', 'Athletic');
alias('villarreal', 'Villarreal CF', 'Villarreal');
alias('real-betis', 'Real Betis Balompié', 'Real Betis', 'Betis');
alias('celta-vigo', 'RC Celta de Vigo', 'Celta de Vigo', 'Celta');
alias('rayo-vallecano', 'Rayo Vallecano', 'Rayo');
alias('osasuna', 'CA Osasuna', 'Osasuna');
alias('real-sociedad', 'Real Sociedad', 'Real Sociedad de Fútbol');
alias('sevilla', 'Sevilla FC', 'Sevilla');
alias('valencia', 'Valencia CF', 'Valencia');
alias('getafe', 'Getafe CF', 'Getafe');
alias('alaves', 'Deportivo Alavés', 'Alavés', 'Alaves');
alias('espanyol', 'RCD Espanyol', 'Espanyol');
alias('levante', 'Levante UD', 'Levante');
alias('elche', 'Elche CF', 'Elche');
alias('racing-santander', 'Racing de Santander', 'Real Racing Club', 'Racing');
alias('deportivo', 'Deportivo de la Coruña', 'RC Deportivo', 'Deportivo', 'Dépor');
alias('malaga', 'Málaga CF', 'Malaga CF', 'Málaga');

export function teamFromCategory(category: string): TeamId | null {
  return TEAM_ALIASES[norm(category)] ?? null;
}

/** Clubes de LaLiga nombrados dentro de un texto libre (un titular), por sus
 *  alias. Se usa para detectar noticias de PARTIDO ("El Betis visita a…"):
 *  dos equipos distintos → la pieza es de ese enfrentamiento, no de uno solo.
 *  Alias más largo primero para que "Real Madrid" gane a "Madrid" suelto. */
export function teamsMentioned(text: string): TeamId[] {
  const t = norm(text);
  const found = new Set<TeamId>();
  const aliases = Object.keys(TEAM_ALIASES).sort((a, b) => b.length - a.length);
  for (const a of aliases) {
    if (a.length < 4) continue; // "rayo" sí, pero nada de 3 letras sueltas
    const slug = TEAM_ALIASES[a];
    if (!slug) continue;
    const re = new RegExp(`(^|[^a-z0-9])${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`);
    if (re.test(t)) found.add(slug);
  }
  return [...found];
}

/** Categorías que no son ni equipo ni ruido → candidatas a protagonista. */
const CATEGORY_NOISE = new Set(
  [
    'primera division', 'futbol', 'laliga', 'laliga ea sports', 'news & politics',
    'deportes', 'equipos', 'deportistas', 'gente', 'sociedad', 'fichajes',
    'mercado fichajes', 'mercado de fichajes', 'segunda division', 'copa del rey',
    'champions league', 'seleccion espanola', 'la fabrica', 'la masia',
  ].map(norm),
);

/**
 * Protagonista de la noticia. Marca ya lo etiqueta como categoría propia
 * ("Jon Pacheco", "Pellegrino Matarazzo"), así que no hace falta NLP sobre el
 * titular. Se descartan estadios y similares exigiendo que aparezca también
 * en el titular — si Marca lo etiqueta pero no se nombra, no es el sujeto.
 */
export function subjectFromCategories(categories: string[], title: string): string | null {
  const t = norm(title);
  for (const c of categories) {
    const n = norm(c);
    if (CATEGORY_NOISE.has(n)) continue;
    if (teamFromCategory(c)) continue;
    if (/estadio|stadium|camp nou|mestalla|bernabeu|metropolitano/.test(n)) continue;
    // Filiales y equipos incrustados ("Real Madrid Castilla") no son personas.
    if (/castilla|filial|atletic club b|femenino|juvenil/.test(n)) continue;
    if (Object.keys(TEAM_ALIASES).some((a) => a.length > 5 && n.includes(a))) continue;
    // El apellido basta: Marca etiqueta "Pellegrino Matarazzo", el titular dice "Matarazzo".
    const parts = n.split(' ').filter((p) => p.length > 3);
    if (parts.some((p) => t.includes(p))) return c;
  }
  // Marca titula media sección como «Apellido: "declaración"» — cuando las
  // categorías no dan a nadie, el que habla es el protagonista.
  const speaker = /^([A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ'.-]+(?: [A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ'.-]+){0,2}),? (?:sobre|:)/.exec(title.trim());
  if (speaker?.[1] && speaker[1].length > 3) return speaker[1];
  return null;
}

const TOPIC_PATTERNS: Array<{ topic: NewsTopic; re: RegExp }> = [
  {
    topic: 'LESION',
    re: /\bles(i[oó]n|ionad|iona)|se pierde|baja por|es baja|parte m[eé]dico|rotura|micro?rrotura|molestias|recae|reca[ií]da|pasa por el quir[oó]fano|dado de alta|duda para/i,
  },
  {
    topic: 'FICHAJES',
    re: /\bfichaj|fich[aó]|traspaso|cesi[oó]n|cedid|renovaci[oó]n|renov[aó]|cl[aá]usula|mercado (de fichajes|invernal|estival)|oferta por|suena para|pretendid|refuerzo|salida de|se marcha al|acuerdo con el/i,
  },
  {
    topic: 'TECNICO',
    re: /\bconvocatoria|convoc[aó]|rueda de prensa|el t[eé]cnico|el entrenador|apuesta por|conf[ií]a en|deja fuera|plan de|sistema|dice que|asegura que|admite|explica/i,
  },
];

/**
 * Tema candidato de una noticia del feed, o null para descartarla sin gastar
 * una llamada. Groq confirma o corrige después, en la misma llamada que
 * escribe la pieza — clasificar aparte costaría el doble de tokens.
 */
export function classifyFeedItem(title: string, summary: string | null): NewsTopic | null {
  const text = `${title} ${summary ?? ''}`;
  for (const { topic, re } of TOPIC_PATTERNS) if (re.test(text)) return topic;
  return null;
}

/** Equipo de la noticia: categorías primero, feed de origen como respaldo. */
export function teamFromItem(categories: string[], feedTeamId: TeamId | null): TeamId | null {
  if (feedTeamId) return feedTeamId;
  for (const c of categories) {
    const t = teamFromCategory(c);
    if (t) return t;
  }
  return null;
}

export const TEAM_NAME: Record<TeamId, string> = Object.fromEntries(
  (Object.keys(TEAMS) as TeamId[]).map((id) => [id, TEAMS[id].name]),
) as Record<TeamId, string>;
