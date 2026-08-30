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
import { POLL, TRACKED_TEAM_IDS } from './shared'
import type { MatchEventType, MatchStatus } from './shared'
import { supabase } from './supabase'
import type {
  GoalChip,
  LineupFreshness,
  LineupPlayer,
  LiveMatch,
  MatchOdds,
  MatchPrediction,
  MatchShot,
  MomentumPoint,
  NewsItem,
  PlayerStat,
  StandingRow,
  StatPeriod,
  TeamLite,
  TeamLineupSnapshot,
  TeamStatPair,
  TeamStatsComparison,
  TimelineEvent,
  UpcomingMatch,
} from '../types/view'

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
  'WOODWORK',
]

export function isLiveStatus(status: MatchStatus | undefined): boolean {
  return status === 'LIVE' || status === 'PAUSED'
}

// --- row shapes (we cast query output to these; the client is untyped) --------

type RawTeam = { id: string; tla: string; name: string; short_name: string }

export type TeamRow = {
  id: string
  name: string
  short_name: string
  tla: string
  primary_color: string | null
  crest_url?: string | null
}

type FixtureRow = {
  id: string
  status: string
  minute: number | null
  half_started_at: string | null
  half_number: number | null
  kickoff_at: string
  matchday: number | null
  home_score: number | null
  away_score: number | null
  // inline identity for the non-tracked side (0002 columns — no `teams` row exists for it)
  home_team_name: string | null
  away_team_name: string | null
  home: RawTeam | RawTeam[] | null
  away: RawTeam | RawTeam[] | null
  competition: { short_name: string } | { short_name: string }[] | null
}

type StandingsQueryRow = {
  team_id: string | null
  team_name: string
  position: number
  played: number | null
  points: number | null
  team: { tla: string } | { tla: string }[] | null
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

/** Prioridad de fuentes para el histórico. Fotmob es la más completa (14
 *  eventos vs 5 de TheSportsDB en el mismo partido) y la que refresca cada
 *  10s, así que manda cuando está presente. */
const EVENT_SOURCE_PRIORITY = ['fotmob', 'apiFootball', 'theSportsDb']

/**
 * El mismo gol llega por varias fuentes a la vez, así que se elige UNA sola
 * (la de mayor prioridad disponible) en vez de mezclarlas.
 *
 * Además deduplica dentro de esa fuente: TheSportsDB llegó a emitir el mismo
 * gol con dos `idTimeline` distintos (visto en vivo: Álex Baena, min 4, ids
 * 1869881 y 1869902), y como la clave única de la tabla incluye
 * `source_event_id`, esas dos filas son legítimamente distintas para la BD
 * pero el mismo evento para el usuario. Aquí se colapsan por
 * (tipo, minuto, jugador).
 */
function preferBestSource(rows: EventRow[]): EventRow[] {
  const source = EVENT_SOURCE_PRIORITY.find((s) => rows.some((r) => r.source === s))
  const chosen = source ? rows.filter((r) => r.source === source) : rows

  const seen = new Set<string>()
  return chosen.filter((r) => {
    const fingerprint = `${r.type}:${r.minute ?? 'x'}:${(r.player_name ?? '').trim().toLowerCase()}`
    if (seen.has(fingerprint)) return false
    seen.add(fingerprint)
    return true
  })
}

const FIXTURE_SELECT =
  'id, status, minute, half_started_at, half_number, kickoff_at, matchday, home_score, away_score, ' +
  'home_team_name, away_team_name, ' +
  'home:teams!home_team_id ( id, tla, name, short_name ), ' +
  'away:teams!away_team_id ( id, tla, name, short_name ), ' +
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

/** Strips common club-suffix words ("FC", "CF", "de Barcelona"...) — shared by
 *  `deriveTla` and `deriveShortName` for a non-tracked club with no `teams` row. */
function stripClubSuffixes(name: string): string {
  return name.replace(/\b(FC|CF|CD|UD|SD|RC|CA|AC|SC|RCD|Club|de)\b/gi, '').replace(/\s+/g, ' ').trim()
}

/** 3-letter code for a non-tracked club that has no `teams.tla`. */
function deriveTla(name: string): string {
  const core = stripClubSuffixes(name).replace(/[^\p{L} ]/gu, '').trim()
  return (core || name).slice(0, 3).toUpperCase()
}

/** Short display name for a non-tracked club that has no `teams.short_name`. */
function deriveShortName(name: string): string {
  return stripClubSuffixes(name) || name
}

/** Prefer the joined tracked-team row; fall back to the inline opponent name. */
function teamFrom(joined: RawTeam | null, inlineName: string | null): TeamLite {
  if (joined) return { id: joined.id, tla: joined.tla, name: joined.name, shortName: joined.short_name }
  const name = inlineName?.trim()
  if (name) return { id: `ext:${name}`, tla: deriveTla(name), name, shortName: deriveShortName(name) }
  return { id: 'tbd', tla: '—', name: 'Rival', shortName: 'Rival' }
}

function toLiveMatch(row: FixtureRow): LiveMatch {
  return {
    id: row.id,
    competitionShort: asOne(row.competition)?.short_name ?? 'LaLiga',
    status: normalizeStatus(row.status),
    minuteLabel: fixtureMinuteLabel(row.status, row.minute),
    halfStartedAt: row.status === 'LIVE' ? row.half_started_at : null,
    halfNumber: row.status === 'LIVE' ? row.half_number : null,
    kickoffAt: row.kickoff_at,
    home: teamFrom(asOne(row.home), row.home_team_name),
    away: teamFrom(asOne(row.away), row.away_team_name),
    homeScore: row.home_score ?? 0,
    awayScore: row.away_score ?? 0,
  }
}

function toUpcomingMatch(row: FixtureRow): UpcomingMatch {
  return {
    id: row.id,
    competitionShort: asOne(row.competition)?.short_name ?? 'LaLiga',
    kickoffAt: row.kickoff_at,
    matchday: row.matchday,
    home: teamFrom(asOne(row.home), row.home_team_name),
    away: teamFrom(asOne(row.away), row.away_team_name),
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

/** `favoriteTeamId` narrows to that club's fixtures; without one (no favorite
 *  chosen yet) any LaLiga match qualifies, same as the pre-favorites behaviour. */
async function fetchLiveMatch(favoriteTeamId?: string | null): Promise<LiveMatch | null> {
  const ids = favoriteTeamId ? [favoriteTeamId] : TRACKED_TEAM_IDS
  const idList = ids.join(',')
  const trackedFilter = `home_team_id.in.(${idList}),away_team_id.in.(${idList})`
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

/** Next `limit` LaLiga+Champions fixtures still to be played, soonest first.
 *  `favoriteTeamId` narrows to that club only (Próximos "solo mi equipo"). */
async function fetchUpcomingFixtures(
  limit: number,
  favoriteTeamId?: string | null,
): Promise<UpcomingMatch[]> {
  let query = supabase
    .from('fixtures')
    .select(FIXTURE_SELECT)
    .eq('status', 'SCHEDULED')
    .order('kickoff_at', { ascending: true })
    .limit(limit)

  if (favoriteTeamId) {
    query = query.or(`home_team_id.eq.${favoriteTeamId},away_team_id.eq.${favoriteTeamId}`)
  }

  const { data, error } = await query.returns<FixtureRow[]>()
  if (error) throw error
  return (data ?? []).map(toUpcomingMatch)
}

/** Latest snapshot (max `captured_at`) of a competition's table, top `limit` rows. */
async function fetchStandings(competitionId: string, limit: number): Promise<StandingRow[]> {
  const latest = await supabase
    .from('standings')
    .select('captured_at')
    .eq('competition_id', competitionId)
    .order('captured_at', { ascending: false })
    .limit(1)
    .maybeSingle<{ captured_at: string }>()
  if (latest.error) throw latest.error
  if (!latest.data) return []

  const { data, error } = await supabase
    .from('standings')
    .select('team_id, team_name, position, played, points, team:teams!team_id ( tla )')
    .eq('competition_id', competitionId)
    .eq('captured_at', latest.data.captured_at)
    .order('position', { ascending: true })
    .limit(limit)
    .returns<StandingsQueryRow[]>()
  if (error) throw error
  return (data ?? []).map((row) => ({
    teamId: row.team_id,
    teamName: row.team_name,
    tla: asOne(row.team)?.tla ?? null,
    position: row.position,
    played: row.played,
    points: row.points,
  }))
}

async function fetchNews(limit: number): Promise<NewsItem[]> {
  const { data, error } = await supabase
    .from('news')
    .select('id, title, summary, url, image_url, published_at')
    .order('published_at', { ascending: false })
    .limit(limit)
    .returns<
      { id: string; title: string; summary: string | null; url: string | null; image_url: string | null; published_at: string | null }[]
    >()
  if (error) throw error
  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    summary: row.summary,
    url: row.url,
    imageUrl: row.image_url,
    publishedAt: row.published_at,
  }))
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
  return preferBestSource(data ?? []).map((row) => ({
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
  return preferBestSource(data ?? [])
    .map((row) => ({
      id: row.id,
      type: normalizeEventType(row.type),
      minuteLabel: eventMinuteLabel(row.minute, row.minute_extra),
      text: buildEventText(row),
    }))
    .reverse()
}

// --- hooks -------------------------------------------------------------------

export function useLiveMatch(opts: { enabled?: boolean; favoriteTeamId?: string | null } = {}) {
  return useQuery({
    queryKey: ['liveMatch', opts.favoriteTeamId ?? null],
    queryFn: () => fetchLiveMatch(opts.favoriteTeamId),
    enabled: (opts.enabled ?? true) && hasSupabaseEnv,
    staleTime: 15_000,
    refetchInterval: (query) =>
      isLiveStatus(query.state.data?.status) ? LIVE_MS : false,
  })
}

/** Un fixture concreto por id — para el histórico (partido ya jugado, sin polling). */
export function useFixtureById(fixtureId: string | undefined) {
  return useQuery({
    queryKey: ['fixtureById', fixtureId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fixtures')
        .select(FIXTURE_SELECT)
        .eq('id', fixtureId as string)
        .returns<FixtureRow[]>()
      if (error) throw error
      return data?.[0] ? toLiveMatch(data[0]) : null
    },
    enabled: hasSupabaseEnv && !!fixtureId,
  })
}

/** Partidos ya jugados de un equipo, más reciente primero. */
export function useTeamMatchHistory(teamId: string | undefined, limit = 20) {
  return useQuery({
    queryKey: ['teamHistory', teamId, limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fixtures')
        .select(FIXTURE_SELECT)
        .eq('status', 'FINISHED')
        .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
        .order('kickoff_at', { ascending: false })
        .limit(limit)
        .returns<FixtureRow[]>()
      if (error) throw error
      return (data ?? []).map(toLiveMatch)
    },
    enabled: hasSupabaseEnv && !!teamId,
  })
}

/** All 20 LaLiga clubs — for the favorite-team picker (Profile) and Teams browse. */
export function useTeams() {
  return useQuery({
    queryKey: ['teams'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('teams')
        .select('id, name, short_name, tla, primary_color')
        .order('name', { ascending: true })
        .returns<TeamRow[]>()
      if (error) throw error
      return data ?? []
    },
    enabled: hasSupabaseEnv,
    staleTime: 6 * 60 * 60 * 1000, // roster barely changes — 6h is plenty
  })
}

/** Próximos partidos (Home usa `limit: 3`, Próximos pide ~30). */
export function useUpcomingFixtures(limit: number, favoriteTeamId?: string | null) {
  return useQuery({
    queryKey: ['upcomingFixtures', limit, favoriteTeamId ?? null],
    queryFn: () => fetchUpcomingFixtures(limit, favoriteTeamId),
    enabled: hasSupabaseEnv,
    staleTime: 5 * 60 * 1000,
  })
}

/** Top `limit` de la clasificación de una competición (Home usa LaLiga, top 5). */
export function useStandings(competitionId: string, limit: number) {
  return useQuery({
    queryKey: ['standings', competitionId, limit],
    queryFn: () => fetchStandings(competitionId, limit),
    enabled: hasSupabaseEnv,
    staleTime: 10 * 60 * 1000,
  })
}

/** `news` está vacía hoy — Home comprueba `data.length` para omitir la sección. */
export function useNews(limit: number) {
  return useQuery({
    queryKey: ['news', limit],
    queryFn: () => fetchNews(limit),
    enabled: hasSupabaseEnv,
    staleTime: 10 * 60 * 1000,
  })
}

/** Un equipo por id — cabecera de `routes/TeamLineup.tsx`. */
export function useTeam(teamId: string | undefined) {
  return useQuery({
    queryKey: ['team', teamId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('teams')
        .select('id, name, short_name, tla, primary_color, crest_url')
        .eq('id', teamId as string)
        .maybeSingle()
        .returns<TeamRow>()
      if (error) throw error
      return data
    },
    enabled: hasSupabaseEnv && !!teamId,
    staleTime: 6 * 60 * 60 * 1000,
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

type PlayerStatRow = {
  player_name: string
  team_id: string
  minutes: number | null
  rating: number | null
  goals: number | null
  assists: number | null
  shots: number | null
  shots_on: number | null
  passes: number | null
  pass_accuracy: number | null
  tackles: number | null
}

/** `player_match_stats` solo existe post-partido (sync de API-Football, no en
 *  vivo) — vacío es un estado normal, no un error. */
async function fetchPlayerStats(fixtureId: string): Promise<PlayerStat[]> {
  const { data, error } = await supabase
    .from('player_match_stats')
    .select(
      'player_name, team_id, minutes, rating, goals, assists, shots, shots_on, passes, pass_accuracy, tackles',
    )
    .eq('fixture_id', fixtureId)
    .order('rating', { ascending: false, nullsFirst: false })
    .returns<PlayerStatRow[]>()
  if (error) throw error
  return (data ?? []).map((row) => ({
    playerName: row.player_name,
    teamId: row.team_id,
    minutes: row.minutes,
    rating: row.rating,
    goals: row.goals ?? 0,
    assists: row.assists ?? 0,
    shots: row.shots ?? 0,
    shotsOn: row.shots_on ?? 0,
    passes: row.passes ?? 0,
    passAccuracy: row.pass_accuracy,
    tackles: row.tackles ?? 0,
  }))
}

export function usePlayerStats(fixtureId: string | undefined, opts: { live?: boolean } = {}) {
  return useQuery({
    queryKey: ['playerStats', fixtureId],
    queryFn: () => fetchPlayerStats(fixtureId as string),
    enabled: hasSupabaseEnv && !!fixtureId,
    refetchInterval: opts.live ? LIVE_MS : false,
  })
}

// --- alineación de un equipo (routes/TeamLineup.tsx) -----------------------

type LineupSnapshotRow = {
  team_id: string
  opponent_name: string | null
  opponent_crest: string | null
  is_home: boolean | null
  kickoff_at: string | null
  formation: string | null
  coach: string | null
  lineup_type: string
  players: LineupPlayer[]
  updated_at: string
}

const ALL_FRESHNESS: LineupFreshness[] = ['confirmed', 'predicted', 'last_played']

function normalizeFreshness(value: string): LineupFreshness {
  return (ALL_FRESHNESS as string[]).includes(value) ? (value as LineupFreshness) : 'last_played'
}

async function fetchTeamLineup(teamId: string): Promise<TeamLineupSnapshot | null> {
  const { data, error } = await supabase
    .from('team_lineup_snapshots')
    .select(
      'team_id, opponent_name, opponent_crest, is_home, kickoff_at, formation, coach, lineup_type, players, updated_at',
    )
    .eq('team_id', teamId)
    .maybeSingle()
    .returns<LineupSnapshotRow>()
  if (error) throw error
  if (!data) return null

  return {
    teamId: data.team_id,
    opponentName: data.opponent_name,
    opponentCrest: data.opponent_crest,
    isHome: data.is_home,
    kickoffAt: data.kickoff_at,
    formation: data.formation,
    coach: data.coach,
    lineupType: normalizeFreshness(data.lineup_type),
    players: data.players ?? [],
    updatedAt: data.updated_at,
  }
}

/** Alineación (titulares + suplentes) del equipo, ya lista para pintar —
 *  una lectura, sin joins. Ver docs/plan-2026-08-29.md §A1/§A4. */
export function useTeamLineup(teamId: string | undefined) {
  return useQuery({
    queryKey: ['teamLineup', teamId],
    queryFn: () => fetchTeamLineup(teamId as string),
    enabled: hasSupabaseEnv && !!teamId,
    staleTime: 10 * 60 * 1000,
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

// no existan, `42P01` (undefined_table de Postgres) se trata como "sin datos
// todavía", no como error: la vista debe verse vacía, nunca romper.

/** true si el error de Supabase es "la tabla no existe" — no una tabla vacía. */
function isMissingTableError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code
  return code === '42P01' || code === 'PGRST205' || code === 'PGRST200'
}

type MomentumRow = { minute: number; value: number }

/** 94 puntos `{minute, value}` de `match_momentum` — positivo domina el local. */
async function fetchMatchMomentum(fixtureId: string): Promise<MomentumPoint[]> {
  const { data, error } = await supabase
    .from('match_momentum')
    .select('minute, value')
    .eq('fixture_id', fixtureId)
    .order('minute', { ascending: true })
    .returns<MomentumRow[]>()
  if (error) {
    if (isMissingTableError(error)) return []
    throw error
  }
  return data ?? []
}

export function useMatchMomentum(fixtureId: string | undefined, opts: { live?: boolean } = {}) {
  return useQuery({
    queryKey: ['matchMomentum', fixtureId],
    queryFn: () => fetchMatchMomentum(fixtureId as string),
    enabled: hasSupabaseEnv && !!fixtureId,
    refetchInterval: opts.live ? LIVE_MS : false,
    retry: false,
  })
}

type TeamStatRow = {
  period: string
  stat_key: string
  label: string
  home_value: number
  away_value: number
  is_decimal: boolean | null
  is_percent: boolean | null
}

const EMPTY_COMPARISON: TeamStatsComparison = { total: [], first: [], second: [] }

/** Comparativa de equipo de `match_team_stats`, separada por periodo. Forma de
 *  fila esperada — a confirmar con el Agente A cuando exista la tabla real. */
async function fetchTeamStats(fixtureId: string): Promise<TeamStatsComparison> {
  const { data, error } = await supabase
    .from('match_team_stats')
    .select('period, stat_key, label, home_value, away_value, is_decimal, is_percent')
    .eq('fixture_id', fixtureId)
    .returns<TeamStatRow[]>()
  if (error) {
    if (isMissingTableError(error)) return EMPTY_COMPARISON
    throw error
  }
  const out: TeamStatsComparison = { total: [], first: [], second: [] }
  for (const row of data ?? []) {
    const period = (row.period === 'first' || row.period === 'second' ? row.period : 'total') as StatPeriod
    const pair: TeamStatPair = {
      key: row.stat_key,
      label: row.label,
      home: row.home_value,
      away: row.away_value,
      isDecimal: row.is_decimal ?? false,
      isPercent: row.is_percent ?? false,
    }
    out[period].push(pair)
  }
  return out
}

export function useTeamMatchStats(fixtureId: string | undefined, opts: { live?: boolean } = {}) {
  return useQuery({
    queryKey: ['teamMatchStats', fixtureId],
    queryFn: () => fetchTeamStats(fixtureId as string),
    enabled: hasSupabaseEnv && !!fixtureId,
    refetchInterval: opts.live ? LIVE_MS : false,
    retry: false,
  })
}

type ShotRow = {
  id: string
  minute: number
  team_id: string
  player_name: string
  event_type: string
  situation: string | null
  is_on_target: boolean | null
  is_blocked: boolean | null
  expected_goals: number | null
}

/** `match_shots` — ver supabase/migrations/0008_shot_events.sql (Agente A). */
async function fetchMatchShots(fixtureId: string): Promise<MatchShot[]> {
  const { data, error } = await supabase
    .from('match_shots')
    .select('id, minute, team_id, player_name, event_type, situation, is_on_target, is_blocked, expected_goals')
    .eq('fixture_id', fixtureId)
    .order('minute', { ascending: true })
    .returns<ShotRow[]>()
  if (error) {
    if (isMissingTableError(error)) return []
    throw error
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    minute: row.minute,
    teamId: row.team_id,
    playerName: row.player_name,
    type: row.event_type as MatchShot['type'],
    situation: row.situation as MatchShot['situation'],
    isOnTarget: row.is_on_target ?? false,
    isBlocked: row.is_blocked ?? false,
    xg: row.expected_goals,
  }))
}

export function useMatchShots(fixtureId: string | undefined, opts: { live?: boolean } = {}) {
  return useQuery({
    queryKey: ['matchShots', fixtureId],
    queryFn: () => fetchMatchShots(fixtureId as string),
    enabled: hasSupabaseEnv && !!fixtureId,
    refetchInterval: opts.live ? LIVE_MS : false,
    retry: false,
  })
}

type OddsRow = {
  bookmaker_id: number
  bookmaker_name: string
  home_odd: number
  draw_odd: number
  away_odd: number
}

/** `match_odds` — supabase/migrations/0010_predictions.sql. Solo partidos SCHEDULED. */
async function fetchMatchOdds(fixtureId: string): Promise<MatchOdds[]> {
  const { data, error } = await supabase
    .from('match_odds')
    .select('bookmaker_id, bookmaker_name, home_odd, draw_odd, away_odd')
    .eq('fixture_id', fixtureId)
    .returns<OddsRow[]>()
  if (error) {
    if (isMissingTableError(error)) return []
    throw error
  }
  return (data ?? []).map((row) => ({
    bookmakerId: row.bookmaker_id,
    bookmakerName: row.bookmaker_name,
    home: row.home_odd,
    draw: row.draw_odd,
    away: row.away_odd,
  }))
}

export function useMatchOdds(fixtureId: string | undefined) {
  return useQuery({
    queryKey: ['matchOdds', fixtureId],
    queryFn: () => fetchMatchOdds(fixtureId as string),
    enabled: hasSupabaseEnv && !!fixtureId,
    retry: false,
  })
}

type PredictionRow = {
  percent_home: number | null
  percent_draw: number | null
  percent_away: number | null
  form_home: number | null
  form_away: number | null
  att_home: number | null
  att_away: number | null
  def_home: number | null
  def_away: number | null
  fotmob_facts: Array<{ templateId: string; values: string[] }> | null
}

/** `match_predictions` — supabase/migrations/0010_predictions.sql. */
async function fetchMatchPrediction(fixtureId: string): Promise<MatchPrediction | null> {
  const { data, error } = await supabase
    .from('match_predictions')
    .select('percent_home, percent_draw, percent_away, form_home, form_away, att_home, att_away, def_home, def_away, fotmob_facts')
    .eq('fixture_id', fixtureId)
    .maybeSingle()
    .returns<PredictionRow>()
  if (error) {
    if (isMissingTableError(error)) return null
    throw error
  }
  if (!data) return null
  return {
    percentHome: data.percent_home,
    percentDraw: data.percent_draw,
    percentAway: data.percent_away,
    formHome: data.form_home,
    formAway: data.form_away,
    attHome: data.att_home,
    attAway: data.att_away,
    defHome: data.def_home,
    defAway: data.def_away,
    facts: (data.fotmob_facts ?? []).map((f) => ({ templateId: f.templateId, values: f.values })),
  }
}

export function useMatchPrediction(fixtureId: string | undefined) {
  return useQuery({
    queryKey: ['matchPrediction', fixtureId],
    queryFn: () => fetchMatchPrediction(fixtureId as string),
    enabled: hasSupabaseEnv && !!fixtureId,
    retry: false,
  })
}
