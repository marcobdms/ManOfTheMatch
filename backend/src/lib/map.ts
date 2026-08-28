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
