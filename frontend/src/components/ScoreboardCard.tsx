import { SoccerBall } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import laligaLogo from '../assets/crests/laliga.svg'
import TeamCrest from './TeamCrest'
import { useLiveMinute } from '../lib/useLiveMinute'
import type { GoalChip, LiveMatch, TeamLite } from '../types/view'

type Props = {
  match: LiveMatch
  goals: GoalChip[]
  /** El escudo lleva al perfil del equipo. Se desactiva cuando la tarjeta
   *  entera ya es un enlace (lista de "En vivo"), para no anidar dos <a>. */
  linkTeams?: boolean
}

/** Slug real de un equipo seguido (no un `ext:Nombre` de Champions ni `tbd`). */
function realSlug(id: string): boolean {
  return !!id && !id.startsWith('ext:') && id !== 'tbd' && id !== 'demo'
}

function TeamBlock({ team, linked }: { team: TeamLite; linked: boolean }) {
  const inner = (
    <>
      <TeamCrest teamId={team.id} name={team.name} tla={team.tla} size={56} className="motm-crest" />
      <span className="motm-team__name">{team.shortName}</span>
    </>
  )
  if (linked && realSlug(team.id)) {
    return (
      <Link to={`/equipos/${team.id}`} className="motm-team motm-team--link">
        {inner}
      </Link>
    )
  }
  return <div className="motm-team">{inner}</div>
}

/** "sáb 13 sept, 18:45" — hora de un partido aún por jugarse. */
function kickoffLabel(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('es-ES', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

export default function ScoreboardCard({ match, goals, linkTeams = true }: Props) {
  const isLive = match.status === 'LIVE' || match.status === 'PAUSED'
  const isScheduled = match.status === 'SCHEDULED'
  const statusLabel = isLive ? 'En directo' : match.status === 'FINISHED' ? 'Finalizado' : 'Previa'
  // Reloj nativo si hay ancla; si no (recién LIVE, o PAUSED — el reloj se
  // congela en el descanso), cae al minuteLabel que ya trae el backend.
  const liveMinute = useLiveMinute(match.halfStartedAt, match.halfNumber)
  const minuteLabel = liveMinute ?? match.minuteLabel

  return (
    // Sin animación de entrada propia: la transición de página (App.tsx) ya
    // hace el fade de toda la vista, y encadenar ambas producía un doble
    // movimiento en cada carga.
    <section className="motm-score">
      <div className="motm-score__top">
        <span className="motm-label motm-score__comp" style={{ color: 'rgba(255,255,255,.5)' }}>
          {match.competitionShort === 'LaLiga' && (
            <img src={laligaLogo} alt="" className="motm-score__comp-logo" aria-hidden="true" />
          )}
          {match.competitionShort} · {statusLabel}
        </span>
        {isScheduled && <span className="motm-score__kickoff">{kickoffLabel(match.kickoffAt)}</span>}
        {isLive && (
          <span
            className="motm-live"
            role="status"
            aria-atomic="true"
            aria-label={`En directo, minuto ${minuteLabel}`}
          >
            <span className="motm-live__dot" />
            {minuteLabel}
          </span>
        )}
      </div>

      <div className="motm-score__grid">
        <TeamBlock team={match.home} linked={linkTeams} />
        <div className="motm-score__num">
          <b>{match.homeScore}</b>
          <span>–</span>
          <b>{match.awayScore}</b>
        </div>
        <TeamBlock team={match.away} linked={linkTeams} />
      </div>

      {goals.length > 0 && (
        <div className="motm-goals" aria-label="Goles del partido">
          {goals.map((g) => (
            <span className="motm-goal-chip" key={`${g.minuteLabel}-${g.player}`}>
              <SoccerBall size={12} weight="fill" />
              {g.minuteLabel} {g.player}
            </span>
          ))}
        </div>
      )}
    </section>
  )
}
