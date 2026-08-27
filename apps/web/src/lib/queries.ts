// Data layer for the "En vivo" view.
// Reads the public (RLS: select using true) tables through the anon Supabase
// client and maps rows to the view models in ../types/view.
//
// Column names come from supabase/migrations/0001_init.sql:
//   fixtures(id, competition_id, home_team_id, away_team_id, kickoff_at,
//            status, minute, home_score, away_score, ...)
//   match_events(id, fixture_id, type, minute, minute_extra, team_id,
//                player_name, assist_name, detail, sort_key, ...)
//   teams(id, tla, name, ...)   competitions(id, short_name, ...)

import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { POLL, TRACKED_TEAM_IDS } from '@motm/shared'
import type { MatchEventType, MatchStatus } from '@motm/shared'
import { supabase } from './supabase'
import type { GoalChip, LiveMatch, TeamLite, TimelineEvent } from '../types/view'

export const hasSupabaseEnv = Boolean(
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY,
)

const LIVE_MS = POLL.liveSeconds * 1000

const ALL_STATUSES: MatchStatus[] = [
  'SCHEDULED',
  'LIVE',
  'PAUSED',
  'FINISHED',
  'POSTPONED',
  'SUSPENDED',
]

const GOAL_TYPES: MatchEventType[] = ['GOAL', 'OWN_GOAL', 'PENALTY_GOAL']

const ALL_EVENT_TYPES: MatchEventType[] = [
  ...GOAL_TYPES,
  'PENALTY_MISS',
  'YELLOW',
  'SECOND_YELLOW',
  'RED',
  'SUB',
  'VAR',
  'PERIOD',
  'CORNER',
  'KEY_PASS',
  'CHANCE',
]

export function isLiveStatus(status: MatchStatus | undefined): boolean {
  return status === 'LIVE' || status === 'PAUSED'
}

// --- row shapes (we cast query output to these; the client is untyped) --------

type RawTeam = { id: string; tla: string; name: string }

type FixtureRow = {
  id: string
  status: string
  minute: number | null
  kickoff_at: string
  home_score: number | null
  away_score: number | null
  // inline identity for the non-tracked side (0002 columns — no `teams` row exists for it)
  home_team_name: string | null
  away_team_name: string | null
  home: RawTeam | RawTeam[] | null
  away: RawTeam | RawTeam[] | null
  competition: { short_name: string } | { short_name: string }[] | null
}

type EventRow = {
  id: string
  type: string
  minute: number | null
  minute_extra: number | null
  team_id: string | null
  player_name: string | null
  assist_name: string | null
  detail: string | null
  source: string | null
  team: { name: string; tla: string } | { name: string; tla: string }[] | null
}

/** Same goal shows up from both 'theSportsDb' (live) and 'apiFootball' (richer).
 *  Prefer the API-Football rows when present. */
function preferApiFootball(rows: EventRow[]): EventRow[] {
  const af = rows.filter((r) => r.source === 'apiFootball')
  return af.length ? af : rows
}

const FIXTURE_SELECT =
  'id, status, minute, kickoff_at, home_score, away_score, ' +
  'home_team_name, away_team_name, ' +
  'home:teams!home_team_id ( id, tla, name ), ' +
  'away:teams!away_team_id ( id, tla, name ), ' +
  'competition:competitions ( short_name )'

const EVENT_SELECT =
  'id, type, minute, minute_extra, team_id, player_name, assist_name, detail, source, ' +
  'team:teams!team_id ( name, tla )'

// --- mappers ----------------------------------------------------------------

function asOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function normalizeStatus(value: string): MatchStatus {
  return (ALL_STATUSES as string[]).includes(value) ? (value as MatchStatus) : 'SCHEDULED'
}

function normalizeEventType(value: string): MatchEventType {
  return (ALL_EVENT_TYPES as string[]).includes(value) ? (value as MatchEventType) : 'CHANCE'
}

function eventMinuteLabel(minute: number | null, extra: number | null): string {
  if (minute == null) return '·'
  return extra && extra > 0 ? `${minute}+${extra}'` : `${minute}'`
}

function fixtureMinuteLabel(status: string, minute: number | null): string {
  if (status === 'PAUSED') return 'Descanso'
  if (status === 'FINISHED') return 'Final'
  if (minute != null) return `${minute}'`
  return "0'"
}

/** 3-letter code for a non-tracked club that has no `teams.tla`. */
function deriveTla(name: string): string {
  const core = name.replace(/\b(FC|CF|CD|UD|SD|RC|CA|AC|SC|RCD)\b/gi, '').replace(/[^\p{L} ]/gu, '').trim()
  return (core || name).slice(0, 3).toUpperCase()
}

/** Prefer the joined tracked-team row; fall back to the inline opponent name. */
function teamFrom(joined: RawTeam | null, inlineName: string | null): TeamLite {
  if (joined) return { id: joined.id, tla: joined.tla, name: joined.name }
  const name = inlineName?.trim()
  if (name) return { id: `ext:${name}`, tla: deriveTla(name), name }
  return { id: 'tbd', tla: '—', name: 'Rival' }
}

function toLiveMatch(row: FixtureRow): LiveMatch {
  return {
    id: row.id,
    competitionShort: asOne(row.competition)?.short_name ?? 'LaLiga',
    status: normalizeStatus(row.status),
    minuteLabel: fixtureMinuteLabel(row.status, row.minute),
    kickoffAt: row.kickoff_at,
    home: teamFrom(asOne(row.home), row.home_team_name),
    away: teamFrom(asOne(row.away), row.away_team_name),
    homeScore: row.home_score ?? 0,
    awayScore: row.away_score ?? 0,
  }
}

/** Spanish one-liner for the timeline, built from type/player/assist/detail. */
function buildEventText(row: EventRow): string {
  const team = asOne(row.team)?.name ?? null
  const player = row.player_name?.trim() || null
  const assist = row.assist_name?.trim() || null
  const detail = row.detail?.trim() || null

  switch (normalizeEventType(row.type)) {
    case 'GOAL':
      return `GOL${team ? ' del ' + team : ''}${player ? ' — ' + player : ''}${
        assist ? ' (asist. ' + assist + ')' : ''
      }`
    case 'PENALTY_GOAL':
      return `GOL${team ? ' del ' + team : ''}${player ? ' — ' + player : ''} (de penalti)`
    case 'OWN_GOAL':
      return `Gol en propia puerta${player ? ' — ' + player : ''}${team ? ' (' + team + ')' : ''}`
    case 'PENALTY_MISS':
      return `Penalti fallado${player ? ' — ' + player : ''}`
    case 'YELLOW':
      return `Tarjeta amarilla${player ? ' a ' + player : ''}${detail ? ' — ' + detail : ''}`
    case 'SECOND_YELLOW':
      return `Segunda amarilla${player ? ' a ' + player : ''} — expulsado`
    case 'RED':
      return `Tarjeta roja${player ? ' a ' + player : ''}${detail ? ' — ' + detail : ''}`
    case 'SUB':
      return `Cambio${team ? ' en ' + team : ''}${player ? ' — entra ' + player : ''}${
        assist ? ', sale ' + assist : ''
      }`
    case 'VAR':
      return `Revisión del VAR${detail ? ' — ' + detail : ''}`
    case 'PERIOD':
      return detail || 'Cambio de periodo'
    case 'CORNER':
      return `Córner${team ? ' a favor del ' + team : ''}`
    case 'KEY_PASS':
      return `Pase filtrado${player ? ' de ' + player : ''}${assist ? ' para ' + assist : ''}`
    case 'CHANCE':
      return `Ocasión${team ? ' del ' + team : ''}${player ? ' — ' + player : ''}`
    default:
      return detail || 'Jugada'
  }
}

// --- fetchers -------------------------------------------------------------------

async function fetchLiveMatch(): Promise<LiveMatch | null> {
  const ids = TRACKED_TEAM_IDS.join(',')
  const trackedFilter = `home_team_id.in.(${ids}),away_team_id.in.(${ids})`
  const base = () => supabase.from('fixtures').select(FIXTURE_SELECT).or(trackedFilter)

  // 1) a match in play
  const inPlay = await base()
    .in('status', ['LIVE', 'PAUSED'])
    .order('kickoff_at', { ascending: false })
    .limit(1)
    .returns<FixtureRow[]>()
  if (inPlay.error) throw inPlay.error
  if (inPlay.data?.length) return toLiveMatch(inPlay.data[0])

  // 2) the next scheduled one (3h grace so a just-kicked-off match still shows)
  const since = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()
  const next = await base()
    .eq('status', 'SCHEDULED')
    .gte('kickoff_at', since)
    .order('kickoff_at', { ascending: true })
    .limit(1)
    .returns<FixtureRow[]>()
  if (next.error) throw next.error
  if (next.data?.length) return toLiveMatch(next.data[0])

  // 3) fall back to the most recent finished match
  const last = await base()
    .eq('status', 'FINISHED')
    .order('kickoff_at', { ascending: false })
    .limit(1)
    .returns<FixtureRow[]>()
  if (last.error) throw last.error
  if (last.data?.length) return toLiveMatch(last.data[0])

  return null
}

async function fetchGoalChips(fixtureId: string): Promise<GoalChip[]> {
  const { data, error } = await supabase
    .from('match_events')
    .select('id, type, minute, minute_extra, player_name, detail, source')
    .eq('fixture_id', fixtureId)
    .in('type', GOAL_TYPES as string[])
    .order('minute', { ascending: true })
    .order('sort_key', { ascending: true })
    .returns<EventRow[]>()
  if (error) throw error
  return preferApiFootball(data ?? []).map((row) => ({
    minuteLabel: eventMinuteLabel(row.minute, row.minute_extra),
    player: row.player_name?.trim() || '—',
  }))
}

async function fetchTimeline(fixtureId: string): Promise<TimelineEvent[]> {
  const { data, error } = await supabase
    .from('match_events')
    .select(EVENT_SELECT)
    .eq('fixture_id', fixtureId)
    .order('minute', { ascending: true })
    .order('sort_key', { ascending: true })
    .returns<EventRow[]>()
  if (error) throw error
  // Query is ascending by minute+sort_key; the mockup lists newest first.
  return preferApiFootball(data ?? [])
    .map((row) => ({
      id: row.id,
      type: normalizeEventType(row.type),
      minuteLabel: eventMinuteLabel(row.minute, row.minute_extra),
      text: buildEventText(row),
    }))
    .reverse()
}

// --- hooks -------------------------------------------------------------------

export function useLiveMatch(opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['liveMatch'],
    queryFn: fetchLiveMatch,
    enabled: (opts.enabled ?? true) && hasSupabaseEnv,
    staleTime: 15_000,
    refetchInterval: (query) =>
      isLiveStatus(query.state.data?.status) ? LIVE_MS : false,
  })
}

export function useGoalChips(
  fixtureId: string | undefined,
  opts: { enabled?: boolean; live?: boolean } = {},
) {
  return useQuery({
    queryKey: ['goalChips', fixtureId],
    queryFn: () => fetchGoalChips(fixtureId as string),
    enabled: (opts.enabled ?? true) && hasSupabaseEnv && !!fixtureId,
    refetchInterval: opts.live ? LIVE_MS : false,
  })
}

export function useTimeline(
  fixtureId: string | undefined,
  opts: { enabled?: boolean; live?: boolean } = {},
) {
  return useQuery({
    queryKey: ['timeline', fixtureId],
    queryFn: () => fetchTimeline(fixtureId as string),
    enabled: (opts.enabled ?? true) && hasSupabaseEnv && !!fixtureId,
    refetchInterval: opts.live ? LIVE_MS : false,
  })
}

/**
 * Realtime bridge: while a fixture is on screen, subscribe to row changes on
 * `fixtures` + `match_events` and invalidate the matching queries so goals show
 * up without waiting for the next poll. No-ops without Supabase env.
 *
 * NOTE: needs `fixtures` and `match_events` in the `supabase_realtime`
 * publication (backend) — see docs/handoff-frontend.md.
 */
export function useLiveRealtime(fixtureId: string | undefined, enabled = true) {
  const qc = useQueryClient()

  useEffect(() => {
    if (!enabled || !fixtureId || !hasSupabaseEnv) return

    const channel = supabase
      .channel(`live-${fixtureId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'match_events',
          filter: `fixture_id=eq.${fixtureId}`,
        },
        () => {
          void qc.invalidateQueries({ queryKey: ['timeline', fixtureId] })
          void qc.invalidateQueries({ queryKey: ['goalChips', fixtureId] })
          void qc.invalidateQueries({ queryKey: ['liveMatch'] })
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'fixtures', filter: `id=eq.${fixtureId}` },
        () => {
          void qc.invalidateQueries({ queryKey: ['liveMatch'] })
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [fixtureId, enabled, qc])
}
