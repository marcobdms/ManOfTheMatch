import { ClockCounterClockwise, UsersThree, Trophy } from '@phosphor-icons/react'
import { Link, useParams } from 'react-router-dom'
import AppHeader from '../components/AppHeader'
import BackButton from '../components/BackButton'
import TeamCrest from '../components/TeamCrest'
import { useTeam } from '../lib/queries'
import { honoursFor } from '../lib/teamHonours'

/**
 * Perfil de equipo: escudo grande + nombre + accesos a su histórico y su
 * alineación, y los últimos títulos. Es la pantalla a la que se llega al
 * tocar el escudo de un equipo en cualquier lista.
 */
export default function TeamProfile() {
  const { teamId } = useParams<{ teamId: string }>()
  const teamQuery = useTeam(teamId)
  const team = teamQuery.data
  const honours = honoursFor(teamId)

  return (
    <>
      <AppHeader />
      <div className="motm-teamprofile">
        <div style={{ padding: '4px 0 0 10px' }}>
          <BackButton />
        </div>

        {teamQuery.isLoading && (
          <div className="motm-skel" style={{ height: 220, margin: '8px 16px' }} aria-hidden="true" />
        )}

        {!teamQuery.isLoading && !team && (
          <div className="motm-empty">
            <b>Equipo no encontrado</b>
            No tenemos la ficha de este equipo.
          </div>
        )}

        {team && (
          <>
            <div className="motm-teamprofile__hero">
              <TeamCrest
                teamId={team.id}
                tla={team.tla}
                name={team.name}
                color={team.primary_color}
                size={96}
              />
              <h1 className="motm-teamprofile__name">{team.name}</h1>
            </div>

            <div className="motm-actions motm-teamprofile__actions">
              <Link className="motm-btn" style={{ flex: 1 }} to={`/historial/${team.id}`}>
                <ClockCounterClockwise size={16} />
                Histórico
              </Link>
              <Link className="motm-btn" style={{ flex: 1 }} to={`/equipos/${team.id}/alineacion`}>
                <UsersThree size={16} />
                Alineación
              </Link>
            </div>

            {honours.length > 0 && (
              <section className="motm-teamprofile__honours">
                <h2 className="motm-label">Últimos títulos</h2>
                <ul>
                  {honours.map((h, i) => (
                    <li key={i}>
                      <Trophy size={15} weight="fill" />
                      <span className="motm-teamprofile__honour-title">{h.title}</span>
                      <span className="motm-teamprofile__honour-year">{h.year}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </>
  )
}
