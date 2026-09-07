import { ClockCounterClockwise, UsersThree, Trophy } from '@phosphor-icons/react'
import { Link, useParams } from 'react-router-dom'
import AppHeader from '../components/AppHeader'
import BackButton from '../components/BackButton'
import TeamCrest from '../components/TeamCrest'
import { useTeam, useStandings, useTeamSeasonStats } from '../lib/queries'
import { factsFor, palmaresLine } from '../lib/teamHonours'

function FormDots({ form }: { form: string }) {
  const results = form.replace(/[^WDL]/gi, '').toUpperCase().slice(-5).split('')
  if (!results.length) return null
  return (
    <span className="motm-table__form">
      {results.map((r, i) => (
        <span key={i} className={'motm-table__form-dot motm-table__form-dot--' + r.toLowerCase()}>
          {r === 'W' ? 'V' : r === 'D' ? 'E' : 'D'}
        </span>
      ))}
    </span>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="motm-tp-stat">
      <span className="motm-tp-stat__value">{value}</span>
      <span className="motm-tp-stat__label">{label}</span>
    </div>
  )
}

/**
 * Perfil de equipo: escudo + nombre, resumen de la temporada, medias de
 * juego, accesos a su histórico y su alineación, y palmarés. Es la pantalla
 * a la que se llega al tocar el escudo de un equipo.
 */
export default function TeamProfile() {
  const { teamId } = useParams<{ teamId: string }>()
  const teamQuery = useTeam(teamId)
  const ligaQuery = useStandings('laliga', 30)
  const statsQuery = useTeamSeasonStats(teamId)

  const team = teamQuery.data
  const row = ligaQuery.data?.find((r) => r.teamId === teamId) ?? null
  const stats = statsQuery.data
  const facts = factsFor(teamId)

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
              <TeamCrest teamId={team.id} tla={team.tla} name={team.name} color={team.primary_color} size={96} />
              <h1 className="motm-teamprofile__name">{team.name}</h1>
              {facts && <p className="motm-teamprofile__since">Fundado en {facts.founded}</p>}
            </div>

            {row && (
              <div className="motm-tp-summary">
                <Stat label="Puesto" value={`${row.position}º`} />
                <Stat label="Puntos" value={String(row.points ?? '—')} />
                <Stat label="PJ" value={String(row.played ?? '—')} />
                <Stat
                  label="V-E-D"
                  value={`${row.won ?? 0}-${row.draw ?? 0}-${row.lost ?? 0}`}
                />
                <Stat label="Goles" value={`${row.goalsFor ?? 0}-${row.goalsAgainst ?? 0}`} />
                {row.form ? (
                  <div className="motm-tp-stat">
                    <FormDots form={row.form} />
                    <span className="motm-tp-stat__label">Racha</span>
                  </div>
                ) : (
                  <Stat
                    label="Dif. goles"
                    value={row.goalDiff == null ? '—' : row.goalDiff > 0 ? `+${row.goalDiff}` : String(row.goalDiff)}
                  />
                )}
              </div>
            )}

            {stats && stats.matches > 0 && (
              <section className="motm-teamprofile__block">
                <h2 className="motm-label">Medias esta temporada</h2>
                <div className="motm-tp-summary">
                  {stats.possession != null && (
                    <Stat label="Posesión" value={`${Math.round(stats.possession)}%`} />
                  )}
                  {stats.shots != null && <Stat label="Remates/partido" value={stats.shots.toFixed(1)} />}
                  {stats.shotsOnTarget != null && (
                    <Stat label="A puerta" value={stats.shotsOnTarget.toFixed(1)} />
                  )}
                  {stats.xg != null && <Stat label="xG/partido" value={stats.xg.toFixed(2)} />}
                  {stats.bigChances != null && (
                    <Stat label="Ocasiones claras" value={stats.bigChances.toFixed(1)} />
                  )}
                </div>
              </section>
            )}

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

            {facts && (facts.recent.length > 0 || palmaresLine(facts)) && (
              <section className="motm-teamprofile__block">
                <h2 className="motm-label">Palmarés</h2>
                {palmaresLine(facts) && (
                  <p className="motm-teamprofile__palmares">{palmaresLine(facts)}</p>
                )}
                {facts.recent.length > 0 && (
                  <ul className="motm-teamprofile__honours">
                    {facts.recent.map((h, i) => (
                      <li key={i}>
                        <Trophy size={15} weight="fill" />
                        <span className="motm-teamprofile__honour-title">{h.title}</span>
                        <span className="motm-teamprofile__honour-year">{h.year}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </>
  )
}
