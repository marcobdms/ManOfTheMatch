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
  kind: 'goal' | 'own_goal' | 'penalty_goal' | 'disallowed_goal' | 'big_chance';
  minute: number | null;
  team: string;
  opponent: string;
  player: string | null;
  homeScore: number;
  awayScore: number;
  /** Solo para 'big_chance' — xG real del disparo, para que el modelo pueda
   *  transmitir "clarísima" sin que se lo tenga que inventar. */
  xg?: number | null;
};

const KIND_LABEL: Record<NarrationEvent['kind'], string> = {
  goal: 'gol',
  own_goal: 'gol en propia puerta',
  penalty_goal: 'gol de penalti',
  disallowed_goal: 'gol anulado por el VAR',
  big_chance: 'ocasión clara de gol desperdiciada (no fue gol)',
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

  const context = {
    evento: KIND_LABEL[ev.kind],
    minuto: ev.minute,
    equipo: ev.team,
    rival: ev.opponent,
    jugador: ev.player,
    marcador_actual: `${ev.homeScore}-${ev.awayScore}`,
    ...(ev.kind === 'big_chance' ? { xg_del_disparo: ev.xg ?? null } : {}),
  };

  const system = `Eres un narrador de fútbol de LaLiga, en español de España. Se te da UN evento real de un partido en curso y escribes UNA sola frase corta (máximo 20 palabras) con vida, al estilo de un comentarista de radio.
REGLAS ESTRICTAS:
- Usa EXCLUSIVAMENTE los datos del JSON que recibes. No inventes asistencias, jugadas previas, lesiones, dorsales ni nada que no esté ahí.
- Si "jugador" es null, no inventes un nombre: refiérete solo al equipo.
- Para "gol anulado por el VAR", la frase debe transmitir que NO sube al marcador.
- Para "ocasión clara de gol desperdiciada", la frase debe transmitir que el disparo NO acabó en gol (usa "xg_del_disparo" solo como referencia de qué tan clara era, no lo menciones como número).
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
