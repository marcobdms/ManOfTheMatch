import type { InsightKind, MatchInsight } from './matchInsights.js';

/**
 * Frases de comentarista para cada tipo de momento. Varias por tipo y se elige
 * una al azar, así el mismo patrón no suena idéntico dos veces — el truco de
 * los videojuegos deportivos.
 *
 * Estas plantillas son la base SIEMPRE: son gratis, instantáneas y no pueden
 * inventarse nada porque solo rellenan huecos con datos reales. Groq (ver
 * `flavorInsight`) solo se usa encima, y si falla se queda esto.
 */
type Ctx = {
  team: string;
  opponent: string;
  facts: Record<string, string | number | null>;
};

const PHRASES: Record<InsightKind, Array<(c: Ctx) => string>> = {
  siege: [
    (c) => `Encerrado el ${c.opponent}: el ${c.team} lleva ${c.facts.minutos} minutos sin soltar el acelerador.`,
    (c) => `Asedio del ${c.team}, que se ha instalado en campo del ${c.opponent}.`,
    (c) => `No sale de su área el ${c.opponent}. Empuja y empuja el ${c.team}.`,
    (c) => `Momento de dominio total del ${c.team} — ${c.facts.minutos} minutos mandando.`,
  ],
  barrage: [
    (c) => `${c.facts.disparos} remates del ${c.team} ${c.facts.ventana}, y ninguno dentro.`,
    (c) => `Lo intenta una y otra vez el ${c.team}: ${c.facts.disparos} disparos seguidos sin premio.`,
    (c) => `Llueven los remates del ${c.team}, pero el marcador sigue igual.`,
    (c) => `Insiste el ${c.team} — ${c.facts.disparos} tiros en nada y menos, y la pelota no entra.`,
  ],
  big_save: [
    (c) => `¡Paradón! Se salva el ${c.team} en un remate clarísimo de ${c.facts.rematador}.`,
    (c) => `La sacó el portero del ${c.team}. Cantaba gol el remate de ${c.facts.rematador}.`,
    (c) => `Manos providenciales en la portería del ${c.team} ante ${c.facts.rematador}.`,
    (c) => `Enorme intervención del ${c.team} para evitar el gol de ${c.facts.rematador}.`,
  ],
  possession_half: [
    (c) => `Al descanso, el balón ha sido del ${c.team}: ${c.facts.posesion}% de posesión.`,
    (c) => `Primera parte con el ${c.team} llevando el peso — ${c.facts.posesion}% del balón.`,
    (c) => `Se llega al descanso con el ${c.team} dueño del partido (${c.facts.posesion}% de posesión).`,
  ],
  comeback: [
    (c) => `¡Le da la vuelta el ${c.team}! Se pone por delante (${c.facts.marcador}).`,
    (c) => `Remontada del ${c.team}, que pasa a mandar en el marcador (${c.facts.marcador}).`,
    (c) => `De ir por detrás a mandar: el ${c.team} da la vuelta al partido (${c.facts.marcador}).`,
  ],
};

/** Etiqueta legible del tipo de momento — la usa el narrador y el frontend. */
export const INSIGHT_LABEL: Record<InsightKind, string> = {
  siege: 'Asedio',
  barrage: 'Sin premio',
  big_save: 'Paradón',
  possession_half: 'Posesión',
  comeback: 'Remontada',
};

/** Elige una plantilla. `seed` la hace estable: el mismo momento del mismo
 *  partido siempre da la misma frase, aunque el job se repita. */
export function phraseFor(insight: MatchInsight, team: string, opponent: string, seed: number): string {
  const options = PHRASES[insight.kind];
  const pick = options[Math.abs(seed) % options.length] ?? options[0]!;
  return pick({ team, opponent, facts: insight.facts });
}
