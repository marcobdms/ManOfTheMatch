/**
 * Narración corta de un evento real (Groq) — texto, nunca audio. Se llama
 * UNA vez al insertar un gol o un gol anulado nuevo (liveTicker.ts /
 * liveTickerEspn.ts), nunca en cada re-poll. Modelo barato y rápido a
 * propósito (frase de una línea, no hace falta razonamiento) — configurable
 * porque Groq mueve su catálogo con frecuencia.
 *
 * Nunca lanza: si Groq falla, tarda, o devuelve algo raro, se devuelve null
 * y el frontend cae al texto plano de siempre (buildEventText). Narrar es
 * un adorno, no debe poder romper la ingesta de eventos en vivo.
 */
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_NARRATION_MODEL || 'llama-3.1-8b-instant';

export type NarrationEvent = {
  kind:
    | 'goal'
    | 'own_goal'
    | 'penalty_goal'
    | 'disallowed_goal'
    | 'big_chance'
    | 'penalty_miss'
    | 'red_card'
    | 'second_yellow';
  minute: number | null;
  team: string;
  opponent: string;
  player: string | null;
  homeScore: number;
  awayScore: number;
  /** Solo para 'big_chance' — xG real del disparo, para que el modelo pueda
   *  transmitir "clarísima" sin que se lo tenga que inventar. */
  xg?: number | null;
  /**
   * Solo para 'big_chance': datos reales del disparo (`match_shots`, 0008).
   * Sin esto el modelo solo sabía "ocasión clara" y todas las frases salían
   * iguales; con esto puede distinguir un paradón de un remate desviado y
   * decir de dónde venía la jugada.
   *
   * OJO: Fotmob no marca los balones al palo (`is_woodwork` siempre false,
   * verificado — ver el comentario de la migración 0008), así que el modelo
   * NO puede decir "al palo": sería inventarlo.
   */
  shot?: {
    /** 'Miss' = fuera / desviado, 'AttemptSaved' = la para el portero. */
    result: string | null;
    /** RegularPlay | FromCorner | SetPiece | FreeKick | FastBreak */
    situation: string | null;
    onTarget: boolean | null;
    blocked: boolean | null;
  } | null;
};

const KIND_LABEL: Record<NarrationEvent['kind'], string> = {
  goal: 'gol',
  own_goal: 'gol en propia puerta',
  penalty_goal: 'gol de penalti',
  disallowed_goal: 'gol anulado por el VAR',
  big_chance: 'ocasión clara de gol desperdiciada (no fue gol)',
  penalty_miss: 'penalti fallado (no fue gol)',
  red_card: 'tarjeta roja directa (expulsado)',
  second_yellow: 'segunda amarilla (expulsado)',
};

/** Traduce los códigos crudos de Fotmob a algo que el modelo entienda sin
 *  tener que adivinar. */
const SITUATION_LABEL: Record<string, string> = {
  RegularPlay: 'jugada normal',
  FromCorner: 'tras un córner',
  SetPiece: 'a balón parado',
  FreeKick: 'de falta directa',
  FastBreak: 'al contraataque',
  Penalty: 'de penalti',
};

const RESULT_LABEL: Record<string, string> = {
  Miss: 'el disparo se fue fuera',
  AttemptSaved: 'el portero la paró',
  Goal: 'fue gol',
};

function sane(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 220) return false;
  // Señales de que el modelo se fue por las ramas en vez de dar la frase.
  if (/\{|\}|```|no puedo|as an ai|lo siento/i.test(t)) return false;
  return true;
}

export async function narrateEvent(ev: NarrationEvent): Promise<string | null> {
  if (!GROQ_API_KEY) return null;

  const shot = ev.shot;
  const context = {
    evento: KIND_LABEL[ev.kind],
    minuto: ev.minute,
    equipo: ev.team,
    rival: ev.opponent,
    jugador: ev.player,
    marcador_actual: `${ev.homeScore}-${ev.awayScore}`,
    ...(ev.kind === 'big_chance'
      ? {
          xg_del_disparo: ev.xg ?? null,
          // Solo se mandan los campos que de verdad tienen valor: un null
          // suelto en el JSON invita al modelo a rellenarlo por su cuenta.
          ...(shot?.result && RESULT_LABEL[shot.result] ? { como_acabo: RESULT_LABEL[shot.result] } : {}),
          ...(shot?.situation && SITUATION_LABEL[shot.situation]
            ? { origen_de_la_jugada: SITUATION_LABEL[shot.situation] }
            : {}),
          ...(shot?.blocked === true ? { rematado_pero: 'un defensa la bloqueó' } : {}),
          ...(shot?.blocked !== true && shot?.onTarget === false
            ? { direccion: 'no iba entre los tres palos' }
            : {}),
        }
      : {}),
  };

  const system = `Eres un narrador de fútbol de LaLiga, en español de España. Se te da UN evento real de un partido en curso y escribes UNA sola frase corta (máximo 20 palabras) con vida, al estilo de un comentarista de radio.
REGLAS ESTRICTAS:
- Usa EXCLUSIVAMENTE los datos del JSON que recibes. No inventes asistencias, jugadas previas, lesiones, dorsales ni nada que no esté ahí.
- Si "jugador" es null, no inventes un nombre: refiérete solo al equipo.
- Para "gol anulado por el VAR", la frase debe transmitir que NO sube al marcador.
- Para "ocasión clara de gol desperdiciada", la frase debe transmitir que el disparo NO acabó en gol (usa "xg_del_disparo" solo como referencia de qué tan clara era, no lo menciones como número).
- Cuando existan, APROVECHA "como_acabo", "origen_de_la_jugada", "rematado_pero" y "direccion" para que la frase cuente qué pasó de verdad ("¡Paradón!", "se le va desviada tras el córner", "la bloquea un defensa") en vez de una frase genérica.
- NUNCA digas que el balón dio en el palo, en el travesaño o en la madera: ese dato NO existe en lo que recibes. Si no está en el JSON, no ha pasado.
- Para "penalti fallado", "tarjeta roja directa" y "segunda amarilla", céntrate en la acción y en lo que supone para el equipo, sin inventar la falta ni el motivo.
- Responde SOLO con la frase en texto plano — sin comillas, sin JSON, sin explicaciones.`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
      signal: controller.signal,
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: JSON.stringify(context) },
        ],
        temperature: 0.6,
        max_tokens: 60,
      }),
    }).finally(() => clearTimeout(timeout));

    if (!res.ok) {
      console.warn('[narrate] Groq respondió', res.status, await res.text().catch(() => ''));
      return null;
    }
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = json.choices?.[0]?.message?.content?.trim() ?? '';
    return sane(text) ? text : null;
  } catch (err) {
    console.warn('[narrate] falló', err);
    return null;
  }
}

/**
 * Reescribe con más chispa la frase de un momento detectado
 * (lib/matchInsights.ts), a partir de la plantilla y de los datos reales que
 * lo justifican. Si Groq falla o dice algo raro, se devuelve null y el
 * llamante se queda con la plantilla — que ya es una frase correcta.
 */
export async function flavorInsight(
  base: string,
  context: Record<string, unknown>,
): Promise<string | null> {
  if (!GROQ_API_KEY) return null;

  const system = `Eres un comentarista de fútbol de LaLiga, en español de España. Recibes una frase base ya correcta sobre un momento real del partido y sus datos.
Devuelve ESA MISMA idea reescrita con más chispa, en UNA sola frase de máximo 20 palabras.
REGLAS ESTRICTAS:
- No añadas NINGÚN dato que no esté en el JSON: ni jugadas, ni asistencias, ni nombres nuevos, ni minutos que no te den.
- No cambies quién es el protagonista ni el sentido de la frase base.
- Responde SOLO con la frase, en texto plano, sin comillas ni explicaciones.`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
      signal: controller.signal,
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: JSON.stringify({ frase_base: base, datos: context }) },
        ],
        temperature: 0.8,
        max_tokens: 60,
      }),
    }).finally(() => clearTimeout(timeout));

    if (!res.ok) {
      console.warn('[narrate] flavorInsight: Groq respondió', res.status);
      return null;
    }
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = json.choices?.[0]?.message?.content?.trim() ?? '';
    return sane(text) ? text : null;
  } catch (err) {
    console.warn('[narrate] flavorInsight falló', err);
    return null;
  }
}
