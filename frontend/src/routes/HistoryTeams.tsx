import { ArrowLeft } from '@phosphor-icons/react'
import { Link, useNavigate } from 'react-router-dom'
import AppHeader from '../components/AppHeader'
import { StaggerItem, StaggerList } from '../components/StaggerList'
import TeamCrest from '../components/TeamCrest'
import { useTeams } from '../lib/queries'

/** Selector de equipo para el histórico — recicla la lista de Equipos.tsx,
 *  cambia solo el destino del click. */
export default function HistoryTeams() {
  const navigate = useNavigate()
  const teamsQuery = useTeams()

  return (
    <>
      <AppHeader />
      <div className="motm-lineup">
        <div className="motm-lineup__head">
          <button type="button" className="motm-iconbtn motm-lineup__back" aria-label="Volver" onClick={() => navigate(-1)}>
            <ArrowLeft size={22} />
          </button>
          <h1 className="motm-lineup__name">Histórico</h1>
        </div>
        <p className="motm-note">Elige un equipo para ver sus partidos jugados.</p>

        {teamsQuery.isLoading && (
          <div className="motm-skel" style={{ height: 320, margin: '16px' }} aria-hidden="true" />
        )}
        {teamsQuery.data && (
          <div style={{ padding: '0 16px' }}>
            <StaggerList className="motm-team-list">
              {teamsQuery.data.map((t) => (
                <StaggerItem key={t.id}>
                  <Link to={`/historial/${t.id}`} className="motm-team-row">
                    <TeamCrest teamId={t.id} tla={t.tla} color={t.primary_color} size={32} />
                    <span className="motm-team-row__name">{t.name}</span>
                  </Link>
                </StaggerItem>
              ))}
            </StaggerList>
          </div>
        )}
      </div>
    </>
  )
}
