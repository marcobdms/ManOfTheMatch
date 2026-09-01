// Adapter: Fotmob (no oficial, sin auth) — fuente primaria de alineaciones con
// posiciones reales x/y. Verificado en vivo 2026-08-29 (docs/plan-2026-08-29.md):
//   - GET https://www.fotmob.com/api/data/matches?date=YYYYMMDD
//     -> leagues[] con id === 87 (LaLiga), matches[].id
//   - GET https://www.fotmob.com/api/data/matchDetails?matchId={id}
//     -> content.lineup, lineupType 'predicted' | 'standard',
//        homeTeam/awayTeam: formation, coach, starters[], subs[]
//   - Cada jugador: id, name, firstName, lastName, age, shirtNumber,
//     countryName, countryCode, positionId, marketValue, horizontalLayout{x,y}
//     (0..1) + performance.rating / performance.seasonRating.
//   - Requiere header User-Agent de navegador. La ruta correcta es /api/data/...
//     ('/api/...' a secas devuelve HTML 404).
//
// Fotmob NO publica límite de rate ni cabeceras X-RateLimit-*/Retry-After
// (ráfaga de prueba: 6 peticiones seguidas, todas 200, sin cabecera de cuota).
// Sin contrato del proveedor -> nos lo autoimponemos aquí con tres capas. Esto
// NO es opcional: es la parte que más le preocupa a Marco (que esto tumbe el
// servicio o cause un baneo por "too many requests").
//
//   1) Throttle de salida: cola secuencial en el módulo, mínimo 3s entre
//      peticiones REALES a Fotmob (nunca en paralelo). El caché de `http_cache`
//      (vía `cachedJson`) evita re-pedir lo que ya tenemos dentro del TTL —
//      solo un cache-miss dispara este throttle.
//   2) Backoff en 429/403/503: no se reintenta en el momento. Se registra el
//      fallo y se devuelve `null` al llamador (que cae a "usar el snapshot
//      anterior" — nunca lanza ni bloquea el resto del sweep).
//   3) Circuit breaker por proceso: 3 fallos (429/403/503) seguidos -> el
//      adapter se "abre" y devuelve `null` sin tocar la red durante 30 min
//      (log explícito). Pasado ese tiempo se cierra solo y reintenta.
//
// Con ~10 fixtures por jornada y TTLs de minutos/horas, el uso real es un
// puñado de peticiones cada 30 min — margen de seguridad amplio a propósito.

import { cachedJson } from '../lib/http.js';

const BASE = 'https://www.fotmob.com/api/data';

// Header de navegador real, obligatorio (api-research.md / plan §A2).
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// --- capa 1: throttle secuencial ------------------------------------------

const MIN_GAP_MS = 3_000;
/** Cola de un solo carril: cada `run()` espera a que termine el anterior Y a
 *  que hayan pasado ≥3s desde el último fetch real antes de arrancar. Así
 *  nunca hay dos peticiones a Fotmob en paralelo ni más rápido que 1 cada 3s. */
let queueTail: Promise<void> = Promise.resolve();
let lastFetchAt = 0;

function throttledRun<T>(fn: () => Promise<T>): Promise<T> {
  const result = queueTail.then(async () => {
    const wait = MIN_GAP_MS - (Date.now() - lastFetchAt);
    if (wait > 0) await sleep(wait);
    lastFetchAt = Date.now();
    return fn();
  });
  // La cola avanza pase lo que pase (éxito o error) — un fallo no la atasca.
  queueTail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// --- capas 2+3: backoff sin reintento + circuit breaker por proceso -------

const FAILURE_THRESHOLD = 3;
const CIRCUIT_COOLDOWN_MS = 30 * 60_000; // 30 min

let consecutiveFailures = 0;
let circuitOpenUntil = 0;

/** Códigos que cuentan como señal de bloqueo/limitación — nunca se reintentan
 *  en el momento, solo se cuentan hacia el circuit breaker. */
const THROTTLE_STATUSES = new Set([429, 403, 503]);

function circuitIsOpen(): boolean {
  return Date.now() < circuitOpenUntil;
}

/** Estado observable del circuit breaker — para que un caller (liveTicker.ts)
 *  pueda dejarlo escrito en `sync_runs.error` y sea visible sin mirar logs. */
export function fotmobCircuitStatus(): { open: boolean; openUntil: string | null; consecutiveFailures: number } {
  return {
    open: circuitIsOpen(),
    openUntil: circuitOpenUntil > 0 ? new Date(circuitOpenUntil).toISOString() : null,
    consecutiveFailures,
  };
}

function recordFailure(status: number): void {
  consecutiveFailures++;
  console.warn(`[fotmob] fallo ${status} (${consecutiveFailures}/${FAILURE_THRESHOLD} seguidos)`);
  if (consecutiveFailures >= FAILURE_THRESHOLD) {
    circuitOpenUntil = Date.now() + CIRCUIT_COOLDOWN_MS;
    console.error(
      `[fotmob] circuit abierto — pausando 30min (hasta ${new Date(circuitOpenUntil).toISOString()})`,
    );
  }
}

function recordSuccess(): void {
  consecutiveFailures = 0;
}

/**
 * GET a través de `cachedJson`, con throttle + circuit breaker aplicados solo
 * al fetch de red real (nunca a un cache-hit ni a una revalidación 304 — ver
 * `beforeFetch` en lib/http.ts). Nunca lanza: cualquier fallo se registra y
 * devuelve `null`, para que el llamador caiga al snapshot anterior sin
 * interrumpir el resto del sweep.
 */
async function fotmobGet<T>(url: string, ttlSeconds: number, maxAgeSeconds?: number): Promise<T | null> {
  if (circuitIsOpen()) {
    console.warn(`[fotmob] circuito abierto — se omite ${url} sin tocar la red`);
    return null;
  }

  try {
    const body = await cachedJson<T>(url, {
      headers: { 'User-Agent': BROWSER_UA },
      ttlSeconds,
      maxAgeSeconds,
      beforeFetch: () => throttledRun(async () => {}),
    });
    recordSuccess();
    return body;
  } catch (err) {
    const status = extractStatus(err);
    if (status != null && THROTTLE_STATUSES.has(status)) {
      recordFailure(status);
    } else {
      // Error de red / parseo / timeout: no es necesariamente un bloqueo de
      // Fotmob, pero tampoco reintentamos aquí — el llamador cae al snapshot.
      console.warn(`[fotmob] error no-HTTP en ${url}`, err);
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

/** Calendario de un día. TTL 1800s (30 min) — suficiente para el cron A3. */
export function getMatchesByDate(yyyymmdd: string) {
  return fotmobGet<FotmobMatchesByDate>(`${BASE}/matches?date=${yyyymmdd}`, 1800);
}

/** Detalle de un partido: `content.lineup`, `content.matchFacts.events`
 *  (goles/tarjetas/cambios/descanso/tiempo añadido) y `content.shotmap.shots`
 *  (disparos con minuto/jugador/tipo/situación).
 *
 *  Todos los llamadores comparten `cache_key` (misma URL), así que en vivo NO
 *  basta con pedir un TTL corto: si `syncLineups` ya dejó una entrada con TTL
 *  de 6 h (partido aún no empezado), esa entrada seguiría sirviéndose "fresca"
 *  y el histórico se congelaría en el estado previo al partido — es
 *  exactamente el bug que dejó el timeline parado en el minuto 55.
 *  `maxAgeSeconds` corta ese caso: en vivo nunca se acepta un body de más de
 *  10 s, sea cual sea el `expires_at` que dejó otro llamador. */
export function getMatchDetails(matchId: number | string, opts: { live: boolean }) {
  const url = `${BASE}/matchDetails?matchId=${matchId}`;
  // 60s en vivo: el CDN de Fotmob cachea esto 5 min, así que bajar de ahí solo
  // gasta peticiones. El marcador urgente lo lleva ESPN (liveTickerEspn).
  return opts.live
    ? fotmobGet<FotmobMatchDetails>(url, 60, 60)
    : fotmobGet<FotmobMatchDetails>(url, 6 * 3600);
}

// --- shapes (solo lo que consumimos, igual que apiFootball.ts) -------------

export const LALIGA_LEAGUE_ID = 87;

export type FotmobMatchesByDate = {
  leagues?: Array<{
    id: number;
    matches?: Array<{
      id: number;
      home: { id: number; name: string };
      away: { id: number; name: string };
      status?: { utcTime?: string | null; finished?: boolean; started?: boolean };
    }>;
  }> | null;
};

export type FotmobPlayer = {
  id: number;
  name: string;
  firstName?: string | null;
  lastName?: string | null;
  age?: number | null;
  shirtNumber?: number | null;
  countryName?: string | null;
  countryCode?: string | null;
  positionId?: number | null;
  marketValue?: number | null;
  horizontalLayout?: { x: number; y: number } | null;
  performance?: { rating?: number | null; seasonRating?: number | null } | null;
};

export type FotmobLineupTeam = {
  formation?: string | null;
  coach?: { name?: string | null } | null;
  starters?: FotmobPlayer[] | null;
  subs?: FotmobPlayer[] | null;
};

/** Un evento del histórico (`content.matchFacts.events.events`). Union laxa:
 *  `type` decide qué campos importan (ver `mapFotmobTickerEvent` en map.ts). */
export type FotmobTickerEvent = {
  type: 'Goal' | 'Card' | 'Substitution' | 'Half' | 'AddedTime' | 'Penalty' | string;
  eventId?: number | null;
  time: number | null;
  overloadTime?: number | null;
  isHome?: boolean | null;
  player?: { id: number | null; name?: string | null } | null;
  // Goal
  ownGoal?: boolean | null;
  goalDescriptionKey?: string | null; // p.ej. "penalty"
  assistStr?: string | null;
  // Card
  card?: 'Yellow' | 'YellowRed' | 'Red' | string | null;
  // Half
  halfStrShort?: string | null; // "HT" | "FT"
  // AddedTime
  minutesAddedInput?: number | null;
  // Substitution
  swap?: Array<{ name: string | null; id: string | null }> | null;
};

export type FotmobStatItem = {
  title: string;
  key?: string;
  /** 'title' = cabecera del grupo, no una estadística (valores [null, null]). */
  type?: string;
  /** 'integer' | 'double' | 'integerWithPercentage' — lo usa el frontend para
   *  saber si "585 (90%)" trae porcentaje dentro. */
  format?: string;
  stats?: [unknown, unknown] | unknown[]; // [home, away] — a veces string "290 (81%)"
};

export type FotmobStatGroup = {
  title: string; // 'Top stats' | 'Shots' | 'Expected goals (xG)' | 'Passes' | 'Defence' | 'Duels'
  key?: string;
  stats?: FotmobStatItem[];
};

export type FotmobPeriodStats = { stats?: FotmobStatGroup[] };

export type FotmobPlayerStatEntry = { key?: string | null; stat?: { value?: unknown; total?: unknown; type?: string } };
export type FotmobPlayerStatGroup = { title: string; key?: string; stats?: Record<string, FotmobPlayerStatEntry> };

export type FotmobPlayerStatsEntry = {
  name: string;
  id: number;
  teamId?: number | null;
  isGoalkeeper?: boolean | null;
  stats?: FotmobPlayerStatGroup[] | null;
};

export type FotmobShot = {
  id?: number | string | null;
  eventType: string; // 'Goal' | 'Miss' | 'AttemptSaved' | ...
  teamId?: number | null;
  playerId?: number | null;
  playerName?: string | null;
  min?: number | null;
  minAdded?: number | null;
  isOnTarget?: boolean | null;
  isBlocked?: boolean | null;
  isFromInsideBox?: boolean | null;
  expectedGoals?: number | null;
  shotType?: string | null;
  situation?: string | null;
};

export type FotmobRefereeStat = { type: string; value?: number | null; valueType?: string | null };

export type FotmobMatchFacts = {
  /** Histórico del partido — lo consume `jobs/liveTicker.ts`. */
  events?: { events?: FotmobTickerEvent[] | null } | null;
  playerOfTheMatch?: {
    name?: { fullName?: string | null } | null;
    rating?: { num?: string | null } | null;
  } | null;
  infoBox?: {
    Stadium?: { name?: string | null; city?: string | null; capacity?: number | null; surface?: string | null } | null;
    Referee?: { text?: string | null; stats?: FotmobRefereeStat[] | null } | null;
    Attendance?: number | null;
  } | null;
  insights?: unknown[] | null;
  topPlayers?: unknown | null;
  /** Pre-partido: frases con plantilla (no texto libre) — el mismo hecho
   *  siempre trae el mismo `TextTemplateId`, se traduce en el frontend. */
  poll?: { oddspoll?: { Facts?: FotmobOddsFact[] | null } | null } | null;
  /** Resumen en vídeo, publicado un rato DESPUÉS del pitido final (verificado
   *  en real: los 3 últimos partidos de LaLiga lo traían, siempre YouTube).
   *  `url` es el enlace normal de YouTube, `image` su miniatura. */
  highlights?: { url?: string | null; image?: string | null; source?: string | null } | null;
} | null;

export type FotmobOddsFact = {
  TextTemplateId: string;
  StatValues: string[];
  defaultText?: string | null;
};

export type FotmobMatchDetails = {
  header?: {
    teams?: Array<{ id: number; name: string; score?: number | null }> | null; // [0]=local, [1]=visitante
  } | null;
  content?: {
    lineup?: {
      lineupType?: 'predicted' | 'standard' | null;
      homeTeam?: FotmobLineupTeam | null;
      awayTeam?: FotmobLineupTeam | null;
    } | null;
    momentum?: { main?: { data?: Array<{ minute: number; value: number }> | null } | null } | null;
    stats?: { Periods?: { All?: FotmobPeriodStats; FirstHalf?: FotmobPeriodStats; SecondHalf?: FotmobPeriodStats } } | null;
    playerStats?: Record<string, FotmobPlayerStatsEntry> | null;
    shotmap?: { shots?: FotmobShot[] | null } | null;
    matchFacts?: FotmobMatchFacts;
    attackingZones?: unknown | null;
    weather?: unknown | null;
    h2h?: unknown | null;
    heatmapUrl?: string | null;
  } | null;
};
