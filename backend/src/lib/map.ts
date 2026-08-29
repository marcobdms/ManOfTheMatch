// Enum / status mapping helpers — football-data.org + API-Football + TheSportsDB
// → our `MatchStatus` / `MatchEventType`. Tables reproduced verbatim from
// docs/api-research.md §6.4 (status) and §6.5 (event type).

import type { MatchStatus, MatchEventType } from './shared.js';

// ---------------------------------------------------------------------------
// §6.4 — status → MatchStatus
// ---------------------------------------------------------------------------

/** football-data.org `match.status`. */
export function mapFootballDataStatus(s: string | null | undefined): MatchStatus {
  switch ((s ?? '').toUpperCase()) {
    case 'SCHEDULED':
    case 'TIMED':
      return 'SCHEDULED';
    case 'IN_PLAY':
      return 'LIVE';
    case 'PAUSED':
      return 'PAUSED';
    case 'FINISHED':
    case 'AWARDED': // walkover / awarded result — decided
      return 'FINISHED';
    case 'POSTPONED':
      return 'POSTPONED';
    case 'SUSPENDED':
    case 'CANCELLED':
      return 'SUSPENDED';
    default:
      return 'SCHEDULED';
  }
}

/** API-Football `fixture.status.short`. */
export function mapApiFootballStatus(short: string | null | undefined): MatchStatus {
  switch ((short ?? '').toUpperCase()) {
    case 'NS':
    case 'TBD':
      return 'SCHEDULED';
    case '1H':
    case '2H':
    case 'ET':
    case 'BT':
    case 'LIVE':
    case 'P':
      return 'LIVE';
    case 'HT':
      return 'PAUSED';
    case 'FT':
    case 'AET':
    case 'PEN':
    case 'AWD':
    case 'WO':
      return 'FINISHED';
    case 'PST':
      return 'POSTPONED';
    case 'SUSP':
    case 'INT':
    case 'ABD':
    case 'CANC':
      return 'SUSPENDED';
    default:
      return 'SCHEDULED';
  }
}

/** TheSportsDB `strStatus` (also `livescore.php` progress strings like "45"/"90"). */
export function mapTheSportsDbStatus(s: string | null | undefined): MatchStatus {
  const v = (s ?? '').trim();
  if (v === '') return 'SCHEDULED';
  const up = v.toUpperCase();
  if (['NS', 'NOT STARTED'].includes(up)) return 'SCHEDULED';
  if (up === 'HT') return 'PAUSED';
  if (['FT', 'AET', 'MATCH FINISHED'].includes(up)) return 'FINISHED';
  if (['PPD', 'POSTP.', 'POSTPONED'].includes(up)) return 'POSTPONED';
  if (['SUSP', 'ABD', 'CANC'].includes(up)) return 'SUSPENDED';
  if (['1H', '2H', 'ET', 'LIVE'].includes(up)) return 'LIVE';
  if (/^\d+$/.test(v)) return 'LIVE'; // in-play minute clock
  return 'SCHEDULED';
}

// ---------------------------------------------------------------------------
// §6.5 — event → MatchEventType  (null = ignore this row)
// ---------------------------------------------------------------------------

/** API-Football `/fixtures/events` `type` + `detail`. */
export function mapApiFootballEvent(
  type: string | null | undefined,
  detail: string | null | undefined,
): MatchEventType | null {
  const t = (type ?? '').toLowerCase().trim();
  const d = (detail ?? '').toLowerCase().trim();
  if (t === 'goal') {
    if (d.includes('own')) return 'OWN_GOAL';
    if (d.includes('missed')) return 'PENALTY_MISS';
    if (d.includes('penalty')) return 'PENALTY_GOAL';
    return 'GOAL';
  }
  if (t === 'card') {
    if (d.includes('second yellow')) return 'SECOND_YELLOW';
    if (d.includes('yellow')) return 'YELLOW';
    if (d.includes('red')) return 'RED';
    return 'YELLOW';
  }
  if (t === 'subst') return 'SUB';
  if (t === 'var') {
    // §6.5: a VAR-overturned penalty award maps to PENALTY_MISS.
    if (d.includes('penalty') && d.includes('cancel')) return 'PENALTY_MISS';
    return 'VAR'; // "Goal cancelled" / "Goal confirmed" / "Penalty confirmed"
  }
  return null;
}

/** TheSportsDB `lookuptimeline` `strTimeline` + `strTimelineDetail`. */
export function mapTheSportsDbEvent(
  timeline: string | null | undefined,
  detail: string | null | undefined,
): MatchEventType | null {
  const t = (timeline ?? '').toLowerCase().trim();
  const d = (detail ?? '').toLowerCase().trim();
  if (t === 'goal') {
    if (d.includes('own')) return 'OWN_GOAL';
    if (d.includes('penalty')) return 'PENALTY_GOAL';
    return 'GOAL';
  }
  if (t.includes('missed penalty') || d.includes('missed penalty')) return 'PENALTY_MISS';
  if (t === 'card') {
    if (d.includes('second')) return 'SECOND_YELLOW';
    if (d.includes('yellow')) return 'YELLOW';
    if (d.includes('red')) return 'RED';
    return 'YELLOW';
  }
  if (t === 'subst') return 'SUB';
  return null;
}

/** Goal-family event types — a score-changing event for one side. */
export const GOAL_EVENT_TYPES: ReadonlySet<MatchEventType> = new Set<MatchEventType>([
  'GOAL',
  'PENALTY_GOAL',
  'OWN_GOAL',
]);

// ---------------------------------------------------------------------------
// Fotmob `horizontalLayout{x,y}` → etiqueta de posición en español.
// ---------------------------------------------------------------------------

/**
 * Fotmob no documenta públicamente su `positionId`, así que NO lo usamos para
 * inventar una etiqueta — solo `x` (la línea, portero→delantero) e `y` (el
 * carril, izquierda→derecha), que sí están verificados en vivo
 * (docs/plan-2026-08-29.md §A2). `x` viene en 0..1 con 0 = línea de fondo
 * propia; los cortes de línea de abajo reproducen un campo típico de 4-3-3 /
 * 4-4-2 / 4-2-3-1 con 4-6 franjas según cuántos jugadores caen en cada banda.
 * Si no hay coordenada, devuelve `null` — la carta se coloca al final de su
 * línea en vez de inventar una posición (regla explícita del plan).
 */
export function fotmobPositionLabel(x: number | null, y: number | null): string | null {
  if (x == null || !Number.isFinite(x)) return null;

  if (x < 0.12) return 'POR';

  const lane = y == null || !Number.isFinite(y) ? 0.5 : y;
  const isWide = lane < 0.22 || lane > 0.78;

  if (x < 0.32) {
    if (isWide) return lane < 0.5 ? 'LI' : 'LD';
    return 'DFC';
  }
  if (x < 0.55) {
    if (isWide) return lane < 0.5 ? 'CI' : 'CD'; // carrilero
    return x < 0.44 ? 'MCD' : 'MC';
  }
  if (x < 0.78) {
    if (isWide) return lane < 0.5 ? 'EI' : 'ED';
    return 'MCO';
  }
  if (isWide) return lane < 0.5 ? 'EI' : 'ED';
  return 'DC';
}
