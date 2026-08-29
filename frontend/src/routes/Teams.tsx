import { Link } from 'react-router-dom'
import AppHeader from '../components/AppHeader'
import { StaggerItem, StaggerList } from '../components/StaggerList'
import TeamCrest from '../components/TeamCrest'
import { useTeams } from '../lib/queries'

/** Browse the 20 LaLiga clubs. Squad + live standings are a follow-up —
 *  this pass focuses on favorito + notificaciones (docs/handoff-schema-notify.md). */
export default function Teams() {
  const teamsQuery = useTeams()

  return (
    <>
      <AppHeader />
      <div className="motm-profile">
        <h1 className="motm-profile__title">Equipos</h1>
        <p className="motm-note motm-profile__hint">
          Los 20 clubes de LaLiga. Elige tu favorito desde{' '}
          <Link to="/perfil">Perfil</Link> para sus notificaciones.
        </p>

        {teamsQuery.isLoading && <div className="motm-skel" style={{ height: 320 }} aria-hidden="true" />}
        {teamsQuery.data && (
          <StaggerList className="motm-team-list">
            {teamsQuery.data.map((t) => (
              <StaggerItem key={t.id}>
                <Link to={`/equipos/${t.id}`} className="motm-team-row">
                  <TeamCrest teamId={t.id} tla={t.tla} color={t.primary_color} size={32} />
                  <span className="motm-team-row__name">{t.name}</span>
                </Link>
              </StaggerItem>
            ))}
          </StaggerList>
        )}
      </div>
    </>
  )
}
