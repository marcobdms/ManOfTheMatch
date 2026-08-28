// Favorite team + per-type notification preferences — stored on-device
// (no login, per docs/handoff-schema-notify.md). This is the source of truth
// the UI reads/writes; `push.ts` mirrors it onto the device's
// `push_subscriptions` row (best-effort, write-only — see there for why).

export type PushPrefs = { matchday: boolean; kickoff: boolean; lineup: boolean; goals: boolean }

const FAVORITE_KEY = 'motm:favoriteTeamId'
const PREFS_KEY = 'motm:pushPrefs'

export const DEFAULT_PREFS: PushPrefs = { matchday: true, kickoff: true, lineup: true, goals: true }

export function getStoredFavoriteTeam(): string | null {
  try {
    return localStorage.getItem(FAVORITE_KEY)
  } catch {
    return null
  }
}

export function setStoredFavoriteTeam(teamId: string | null): void {
  try {
    if (teamId) localStorage.setItem(FAVORITE_KEY, teamId)
    else localStorage.removeItem(FAVORITE_KEY)
  } catch {
    // storage unavailable (private mode, disabled) — favorite just won't persist
  }
}

export function getStoredPrefs(): PushPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return DEFAULT_PREFS
    return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<PushPrefs>) }
  } catch {
    return DEFAULT_PREFS
  }
}

export function setStoredPrefs(prefs: PushPrefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // ignore
  }
}
