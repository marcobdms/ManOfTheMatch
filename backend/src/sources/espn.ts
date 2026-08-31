// Adapter: ESPN (público, sin auth) — fuente de marcador/goles/tarjetas de
// BAJA LATENCIA. Verificado en vivo 2026-08-29 (docs/plan-2026-08-29.md):
//   GET https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/scoreboard
//   -> cache-control: max-age=1. 10 peticiones seguidas cada 2s: todas 200,
//      25-60ms. events[].competitions[0].details[] trae goles/tarjetas con
//      minuto correcto (incl. "45'+4'"), tipo y jugador; events[].status
//      trae displayClock/period. Ids estables (evento y equipos).
//
// Mismo patrón defensivo que sources/fotmob.ts — no es opcional, aunque ESPN
// no muestre señales de bloqueo hoy: nunca lanza, siempre puede degradar a
// "no tocar la red" si empieza a fallar.
//   1) Throttle de salida: cola de un solo carril, mínimo 1.5s entre
//      peticiones reales (el propio job ya limita a 1 en vuelo, esto es un
//      cinturón adicional si algún día hay dos llamadores).
//   2) Backoff en 429/403/503: no se reintenta en el momento, se cuenta y se
//      devuelve `null` — el llamador conserva el último marcador conocido.
//   3) Circuit breaker por proceso: 3 fallos seguidos -> se abre 30 min.

import { cachedJson } from '../lib/http.js';

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// --- capa 1: throttle secuencial ------------------------------------------

const MIN_GAP_MS = 1_500;
let queueTail: Promise<void> = Promise.resolve();
let lastFetchAt = 0;

function throttledRun<T>(fn: () => Promise<T>): Promise<T> {
  const result = queueTail.then(async () => {
    const wait = MIN_GAP_MS - (Date.now() - lastFetchAt);
    if (wait > 0) await sleep(wait);
    lastFetchAt = Date.now();
    return fn();
  });
  queueTail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// --- capas 2+3: backoff sin reintento + circuit breaker por proceso -------

const FAILURE_THRESHOLD = 3;
const CIRCUIT_COOLDOWN_MS = 30 * 60_000;

let consecutiveFailures = 0;
let circuitOpenUntil = 0;

const THROTTLE_STATUSES = new Set([429, 403, 503]);

function circuitIsOpen(): boolean {
  return Date.now() < circuitOpenUntil;
}

function recordFailure(status: number): void {
  consecutiveFailures++;
  console.warn(`[espn] fallo ${status} (${consecutiveFailures}/${FAILURE_THRESHOLD} seguidos)`);
  if (consecutiveFailures >= FAILURE_THRESHOLD) {
    circuitOpenUntil = Date.now() + CIRCUIT_COOLDOWN_MS;
    console.error(
      `[espn] circuit abierto — pausando 30min (hasta ${new Date(circuitOpenUntil).toISOString()})`,
    );
  }
}

function recordSuccess(): void {
  consecutiveFailures = 0;
}

/** Estado del circuito, para diagnóstico (mismo patrón que fotmobCircuitStatus). */
export function espnCircuitStatus(): { open: boolean; openUntil: string | null; consecutiveFailures: number } {
  return {
    open: circuitIsOpen(),
    openUntil: circuitOpenUntil > 0 ? new Date(circuitOpenUntil).toISOString() : null,
    consecutiveFailures,
  };
}

async function espnGet<T>(url: string, ttlSeconds: number): Promise<T | null> {
  if (circuitIsOpen()) {
    console.warn(`[espn] circuito abierto — se omite ${url} sin tocar la red`);
    return null;
  }

  try {
    const body = await cachedJson<T>(url, {
      headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' },
      ttlSeconds,
      beforeFetch: () => throttledRun(async () => {}),
    });
    recordSuccess();
    return body;
  } catch (err) {
    const status = extractStatus(err);
    if (status != null && THROTTLE_STATUSES.has(status)) {
      recordFailure(status);
    } else {
      console.warn(`[espn] error no-HTTP en ${url}`, err);
    }
    return null;
  }
}

function extractStatus(err: unknown): number | null {
  const msg = err instanceof Error ? err.message : String(err);
  const m = /->\s*(\d{3})\s/.exec(msg);
  return m ? Number(m[1]) : null;
}

// --- endpoints (verificado en vivo 2026-08-29) ------------------------------

/**
 * Scoreboard de LaLiga completo (todos los partidos del día en curso según
 * ESPN). TTL 1s de origen; aquí usamos 2s porque es la cadencia del job — el
 * caché de `http_cache` evita ráfagas si dos llamadores coincidieran.
 */
export function getScoreboard() {
  return espnGet<EspnScoreboard>(`${BASE}/scoreboard`, 2);
}

/** Los 20 equipos con su id ESPN — para `resolveTeamIds.ts`. TTL largo, es
 *  un catálogo estático que casi nunca cambia. */
export function getTeams() {
  return espnGet<EspnTeamsResponse>(`${BASE}/teams?limit=50`, 24 * 3600);
}

/**
 * Resumen de UN partido concreto por su id ESPN. A diferencia de
 * `getScoreboard()` (solo el día en curso) este sí responde por partidos
 * pasados, que es justo lo que hace falta para cerrar un fixture que se quedó
 * atascado en LIVE de un día anterior (ver el guard de liveLoop.ts). TTL alto:
 * un partido terminado ya no cambia.
 */
export function getSummary(eventId: string) {
  return espnGet<EspnSummary>(`${BASE}/summary?event=${encodeURIComponent(eventId)}`, 3600);
}

// --- shapes (solo lo que consumimos, verificado en vivo 2026-08-29) --------

export type EspnAthlete = {
  id?: string;
  displayName?: string | null;
  shortName?: string | null;
  jersey?: string | null;
};

/** Un evento del timeline (gol/tarjeta/etc). Los flags son booleanos planos
 *  en el detail, no anidados en `type`. */
export type EspnDetail = {
  type?: { id?: string; text?: string | null } | null; // "Goal", "Goal - Header", "Yellow Card"...
  clock?: { value?: number | null; displayValue?: string | null } | null; // "45'+4'"
  team?: { id?: string | null } | null;
  athletesInvolved?: EspnAthlete[] | null;
  scoringPlay?: boolean | null;
  redCard?: boolean | null;
  yellowCard?: boolean | null;
  ownGoal?: boolean | null;
  penaltyKick?: boolean | null;
  shootout?: boolean | null;
};

export type EspnCompetitor = {
  id?: string;
  homeAway?: 'home' | 'away';
  score?: string;
  team?: { id?: string } | null;
};

export type EspnStatus = {
  clock?: number | null;
  displayClock?: string | null;
  period?: number | null;
  type?: {
    id?: string;
    name?: string | null; // 'STATUS_SCHEDULED' | 'STATUS_IN_PROGRESS' | 'STATUS_HALFTIME' | 'STATUS_FULL_TIME'...
    state?: 'pre' | 'in' | 'post' | null;
    completed?: boolean | null;
  } | null;
};

export type EspnEvent = {
  id: string;
  date?: string;
  status?: EspnStatus | null;
  competitions?: Array<{
    id?: string;
    competitors?: EspnCompetitor[] | null;
    details?: EspnDetail[] | null;
    status?: EspnStatus | null;
  }> | null;
};

export type EspnScoreboard = {
  events?: EspnEvent[] | null;
};

/** `/summary?event=` — solo la cabecera, que es de donde sacamos marcador y
 *  estado final de un partido ya jugado (verificado en vivo 2026-08-31). */
export type EspnSummary = {
  header?: {
    competitions?: Array<{
      status?: EspnStatus | null;
      competitors?: EspnCompetitor[] | null;
    }> | null;
  } | null;
};

export type EspnTeamsResponse = {
  sports?: Array<{
    leagues?: Array<{
      teams?: Array<{ team?: { id?: string; displayName?: string; abbreviation?: string } | null }> | null;
    }> | null;
  }> | null;
};
