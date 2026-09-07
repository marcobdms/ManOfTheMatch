/**
 * Reescritura de una noticia con Groq. NO se traduce ni se parafrasea el
 * artículo ajeno: su titular entra como pista de "qué ha pasado" y la pieza se
 * escribe desde cero sobre los datos de `newsContext.ts`. La fuente original
 * se cita y se enlaza siempre (columnas original_*).
 *
 * Modelo barato a propósito (gpt-oss-20b, el más barato con acceso: los Llama
 * de chat ya no están en el catálogo de Groq): es un titular y un párrafo, no
 * hace falta razonamiento. Nunca lanza — si Groq falla se devuelve null y el draft se
 * queda pendiente para la siguiente pasada.
 */
import type { NewsContext } from './newsContext.js';
import { OWN_TOPICS, type NewsTopic } from './newsTaxonomy.js';

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_NEWS_MODEL = process.env.GROQ_NEWS_MODEL || 'openai/gpt-oss-20b';

export type WrittenPiece = { title: string; body: string; topic: NewsTopic };

const TOPICS: NewsTopic[] = ['ONCE', 'PREVIA', 'CRONICA', 'LESION', 'TECNICO', 'FICHAJES'];

const SYSTEM = `Eres redactor de una app de LaLiga, en español de España. Recibes un JSON con (a) la PISTA: el titular de una noticia publicada por otro medio, y (b) DATOS: cifras reales de nuestra propia base de datos sobre ese equipo y ese jugador.

Escribes una pieza BREVE Y ORIGINAL. No traduces ni reescribes el artículo ajeno: usas la pista solo para saber QUÉ ha pasado, y el valor lo pones tú explicando QUÉ SIGNIFICA para el equipo, apoyándote en los DATOS.

REGLAS ESTRICTAS:
- Usa EXCLUSIVAMENTE los datos del JSON. Prohibido inventar cifras, fechas, dorsales, declaraciones, lesiones o fichajes que no estén ahí.
- NUNCA digas la posición ni el rol de un futbolista (delantero, mediocentro, lateral, capitán...): ese dato NO lo recibes. Si no está en el JSON, no lo escribas.
- No copies códigos ni siglas del JSON tal cual: escribe siempre en castellano corriente.
- Escribe en pasado o presente, según lo que ya ha ocurrido; no uses futuro para algo que ya pasó.
- Si los DATOS vienen vacíos, escribe la pieza solo con lo que dice la pista, sin rellenar con suposiciones.
- NOMBRA SIEMPRE a los equipos y a las personas por su nombre. Está PROHIBIDO escribir "el rival", "el equipo", "el conjunto", "los locales" o "los visitantes" en lugar del nombre. Si la pista dice "El Getafe recibe al Celta", el titular nombra a Getafe y a Celta.
- EL TITULAR TIENE QUE CONTAR EL HECHO CONCRETO, no describir el tema. De 4 a 10 palabras, sin puntuación final, y distinto al de la pista.
  · Resultado: quién gana a quién y por cuánto ("El Alavés golea 5-2 al Osasuna").
  · Declaración: quién habla y qué dice ("Luís Castro: el punto no es malo").
  · Lesión o fichaje: a quién le pasa y qué ("Lobete se rompe el cruzado").
  · Previa: los dos equipos y qué está en juego o la jornada ("Getafe-Celta abre la quinta jornada").
  · Once: el equipo y algo del once ("El Elche confirma su once con un 4-3-3").
  PROHIBIDOS los titulares genéricos que valdrían para cualquier equipo cualquier día: "analiza su rendimiento", "hace balance", "mira al futuro", "busca la victoria", "afronta un nuevo reto", "se enfrenta a su rival". Si tu titular no nombra a los protagonistas y un hecho verificable del JSON, está mal.
- El párrafo son 2-3 frases (máximo 60 palabras). Directo, sin floritura y sin frases de relleno.
- No cites al otro medio por su nombre ni digas "según informa": el enlace a la fuente ya se muestra aparte.
- No uses comillas de declaraciones salvo que aparezcan literales en la pista.
- Clasifica la pieza en uno de estos temas: LESION (bajas y estado físico), TECNICO (decisiones y declaraciones del entrenador), FICHAJES (mercado, altas y salidas), ONCE (alineaciones confirmadas), PREVIA (partido por jugarse), CRONICA (partido ya jugado).

Responde SOLO con JSON válido, sin texto fuera:
{"titular":"...","parrafo":"...","tema":"LESION"|"TECNICO"|"FICHAJES"|"ONCE"|"PREVIA"|"CRONICA"}`;

/** Titulares de relleno que valdrían para cualquier equipo cualquier día, o
 *  que esconden a los protagonistas tras "el rival"/"el equipo". El prompt ya
 *  los prohíbe, pero el modelo reincide: "Levante analiza su rendimiento" de
 *  una declaración concreta, "Rival recibe al rival en LaLiga" de una previa. */
const VAGUE_TITLE_RE =
  /analiza su|analisis|hace balance|mira al futuro|busca la victoria|afronta (un|el) |nuevo reto|se prepara para|repasa (su|el)|valora (su|el)|reflexiona|rendimiento del equipo|\b(el|su|al|del) rival\b|el equipo se |el conjunto |los locales|los visitantes|nuevo encuentro|proxim[oa] (partido|jornada|encuentro|duelo)$/i;

function sane(piece: WrittenPiece | null): piece is WrittenPiece {
  if (!piece) return false;
  const { title, body } = piece;
  if (VAGUE_TITLE_RE.test(title)) return false;
  if (title.length < 10 || title.length > 120) return false;
  if (body.length < 40 || body.length > 600) return false;
  if (/```|\{|\}|no puedo|as an ai|lo siento|seg[uú]n informa/i.test(title + body)) return false;
  return true;
}

export async function writeNewsPiece(input: {
  originalTitle: string;
  originalSummary: string | null;
  topicHint: NewsTopic;
  subject: string | null;
  context: NewsContext;
}): Promise<WrittenPiece | null> {
  if (!GROQ_API_KEY) return null;

  const payload = {
    pista: {
      titular: input.originalTitle,
      entradilla: input.originalSummary,
      tema_probable: input.topicHint,
      protagonista: input.subject,
    },
    datos: input.context,
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
      signal: controller.signal,
      body: JSON.stringify({
        model: GROQ_NEWS_MODEL,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: JSON.stringify(payload) },
        ],
        response_format: { type: 'json_object' },
        // gpt-oss razona antes de responder y esos tokens salen del mismo
        // presupuesto: con 350 se quedaba sin margen para el JSON y Groq
        // devolvía json_validate_failed con la generación vacía.
        reasoning_effort: 'low',
        temperature: 0.5,
        max_tokens: 900,
      }),
    }).finally(() => clearTimeout(timeout));

    if (!res.ok) {
      console.warn('[newsWriter] Groq respondió', res.status, await res.text().catch(() => ''));
      return null;
    }
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = json.choices?.[0]?.message?.content ?? '';
    const parsed = JSON.parse(raw) as { titular?: unknown; parrafo?: unknown; tema?: unknown };

    if (typeof parsed.titular !== 'string' || typeof parsed.parrafo !== 'string') return null;
    // ONCE/PREVIA/CRONICA los fija nuestro job desde la base: ahí el modelo
    // no tiene nada que clasificar y equivocarse solo empeoraría el dato.
    const topic = OWN_TOPICS.includes(input.topicHint)
      ? input.topicHint
      : TOPICS.includes(parsed.tema as NewsTopic)
        ? (parsed.tema as NewsTopic)
        : input.topicHint;

    const piece: WrittenPiece = {
      title: parsed.titular.trim().replace(/^["'«»]|["'«»]$/g, ''),
      body: parsed.parrafo.trim(),
      topic,
    };
    return sane(piece) ? piece : null;
  } catch (err) {
    console.warn('[newsWriter] falló', err);
    return null;
  }
}

export { GROQ_NEWS_MODEL };
