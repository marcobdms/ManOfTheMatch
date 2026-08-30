import { ArrowLeft } from '@phosphor-icons/react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import AppHeader from '../components/AppHeader'
import { StaggerItem, StaggerList } from '../components/StaggerList'
import TeamCrest from '../components/TeamCrest'
import { useTeam, useTeamMatchHistory } from '../lib/queries'
import type { LiveMatch } from '../types/view'

function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' }).format(date)
}

function HistoryRow({ match }: { match: LiveMatch }) {
  return (
    <Link to={`/partidos/${match.id}`} className="motm-fixture-row">
      <span className="motm-fixture-row__time">{formatDate(match.kickoffAt)}</span>
      <span className="motm-fixture-row__team">
        <TeamCrest teamId={match.home.id} tla={match.home.tla} size={24} className="motm-fixture-row__crest" />
        <span className="motm-fixture-row__name">{match.home.shortName}</span>
      </span>
      <span className="motm-fixture-row__vs">{match.homeScore}–{match.awayScore}</span>
      <span className="motm-fixture-row__team motm-fixture-row__team--away">
        <span className="motm-fixture-row__name">{match.away.shortName}</span>
        <TeamCrest teamId={match.away.id} tla={match.away.tla} size={24} className="motm-fixture-row__crest" />
      </span>
    </Link>
  )
}

/** Partidos jugados de un equipo — recicla la fila de Próximos.tsx, cambiando
 *  la hora por la fecha y el "vs" por el marcador. */
export default function TeamHistory() {
  const { teamId } = useParams<{ teamId: string }>()
  const navigate = useNavigate()
  const teamQuery = useTeam(teamId)
  const historyQuery = useTeamMatchHistory(teamId)

  const team = teamQuery.data
  const matches = historyQuery.data ?? []
  const loading = teamQuery.isLoading || historyQuery.isLoading

  return (
    <>
      <AppHeader />
      <div className="motm-lineup">
        <div className="motm-lineup__head">
          <button type="button" className="motm-iconbtn motm-lineup__back" aria-label="Volver" onClick={() => navigate(-1)}>
            <ArrowLeft size={22} />
          </button>
          <TeamCrest teamId={teamId} tla={team?.tla ?? '—'} color={team?.primary_color} size={40} />
          <div className="motm-lineup__identity">
            <h1 className="motm-lineup__name">{team?.short_name ?? team?.name ?? (loading ? '' : 'Equipo')}</h1>
          </div>
        </div>

        {loading && <div className="motm-skel" style={{ height: 260, margin: '16px' }} aria-hidden="true" />}

        {!loading && matches.length === 0 && (
          <div className="motm-empty">
            <b>Sin partidos todavía</b>
            Este equipo aún no ha jugado ningún partido esta temporada.
          </div>
        )}

        {!loading && matches.length > 0 && (
          <div style={{ padding: '0 16px' }}>
            <StaggerList className="motm-fixture-list">
              {matches.map((m) => (
                <StaggerItem key={m.id}>
                  <HistoryRow match={m} />
                </StaggerItem>
              ))}
            </StaggerList>
          </div>
        )}
      </div>
    </>
  )
}
