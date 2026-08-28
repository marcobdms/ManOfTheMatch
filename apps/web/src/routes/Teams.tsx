import { Link } from 'react-router-dom'
import AppHeader from '../components/AppHeader'
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
          <ul className="motm-team-list">
            {teamsQuery.data.map((t) => (
              <li key={t.id}>
                <div className="motm-team-row">
                  <span className="motm-team-row__swatch" style={{ background: t.primary_color ?? 'var(--muted)' }}>
                    {t.tla}
                  </span>
                  <span className="motm-team-row__name">{t.name}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}
