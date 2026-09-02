import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import AppHeader from '../components/AppHeader'
import ScoreboardCard from '../components/ScoreboardCard'
import { StaggerItem, StaggerList } from '../components/StaggerList'
import TeamCrest from '../components/TeamCrest'
import { useGoalChips, useLiveMatch, useNews, useStandings, useUpcomingFixtures } from '../lib/queries'
import { useAuth } from '../lib/AuthProvider'
import type { UpcomingMatch } from '../types/view'

const NEXT_MATCHES_LIMIT = 3
const STANDINGS_LIMIT = 5
const NEWS_LIMIT = 4

function formatKickoff(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('es-ES', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function NextMatchRow({ match }: { match: UpcomingMatch }) {
  return (
    <Link to={`/equipos/${match.home.id}`} className="motm-next-row">
      <TeamCrest teamId={match.home.id} tla={match.home.tla} size={22} className="motm-next-row__crest" />
      <span className="motm-next-row__vs">{match.home.tla} – {match.away.tla}</span>
      <TeamCrest teamId={match.away.id} tla={match.away.tla} size={22} className="motm-next-row__crest" />
      <span className="motm-next-row__when">{formatKickoff(match.kickoffAt)}</span>
    </Link>
  )
}

/** Bloque de la portada. Sin fade de entrada: se pagaba en cada visita a
 *  Home, justo cuando el usuario acaba de tocar la pestaña. `index` se
 *  conserva en la firma porque las llamadas lo pasan y sigue documentando el
 *  orden de los bloques. */
function Section({ children }: { index: number; children: ReactNode }) {
  return <section className="motm-home__section">{children}</section>
}

export default function Home() {
  const { profile } = useAuth()
  const favoriteTeamId = profile?.favorite_team_id ?? null
  const liveQuery = useLiveMatch({ favoriteTeamId })
  const match = liveQuery.data
  const goalsQuery = useGoalChips(match?.id, { enabled: !!match })

  const upcomingQuery = useUpcomingFixtures(NEXT_MATCHES_LIMIT)
  const standingsQuery = useStandings('laliga', STANDINGS_LIMIT)
  const newsQuery = useNews(NEWS_LIMIT)

  const hasNews = (newsQuery.data?.length ?? 0) > 0

  return (
    <>
      <AppHeader />
      <div className="motm-home">
        {liveQuery.isLoading && <div className="motm-skel" aria-hidden="true" />}

        {match && <ScoreboardCard match={match} goals={goalsQuery.data ?? []} />}

        {!liveQuery.isLoading && !match && (
          <div className="motm-empty" role="status">
            <b>Sin partido destacado</b>
            No hay partidos de LaLiga en juego ahora mismo.
          </div>
        )}

        <Section index={0}>
          <div className="motm-home__section-head">
            <h2 className="motm-label">Próximos partidos</h2>
            <Link to="/proximos" className="motm-home__see-all">Ver todos</Link>
          </div>

          {upcomingQuery.isLoading && (
            <div className="motm-skel" style={{ height: 140 }} aria-hidden="true" />
          )}

          {upcomingQuery.data && upcomingQuery.data.length === 0 && (
            <p className="motm-note">No hay partidos programados por ahora.</p>
          )}

          {upcomingQuery.data && upcomingQuery.data.length > 0 && (
            <StaggerList className="motm-next-list">
              {upcomingQuery.data.map((m) => (
                <StaggerItem key={m.id}>
                  <NextMatchRow match={m} />
                </StaggerItem>
              ))}
            </StaggerList>
          )}
        </Section>

        <Section index={1}>
          <div className="motm-home__section-head">
            <h2 className="motm-label">Clasificación</h2>
            <Link to="/clasificacion" className="motm-home__see-all">Ver tabla</Link>
          </div>

          {standingsQuery.isLoading && (
            <div className="motm-skel" style={{ height: 220 }} aria-hidden="true" />
          )}

          {standingsQuery.data && standingsQuery.data.length === 0 && (
            <p className="motm-note">Todavía no hay clasificación disponible.</p>
          )}

          {standingsQuery.data && standingsQuery.data.length > 0 && (
            <table className="motm-standings">
              <tbody>
                {standingsQuery.data.map((row) => (
                  <tr key={row.teamId ?? row.teamName}>
                    <td className="motm-standings__pos">{row.position}</td>
                    <td className="motm-standings__crest">{row.tla ?? '—'}</td>
                    <td className="motm-standings__name">{row.teamName}</td>
                    <td className="motm-standings__played">{row.played ?? '—'}</td>
                    <td className="motm-standings__pts">{row.points ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        {hasNews && (
          <Section index={2}>
            <h2 className="motm-label">Noticias</h2>
            <div className="motm-news-list">
              {newsQuery.data!.map((item) => (
                <a
                  key={item.id}
                  href={item.url ?? undefined}
                  target="_blank"
                  rel="noreferrer"
                  className="motm-news-item"
                >
                  <span className="motm-news-item__title">{item.title}</span>
                  {item.summary && <span className="motm-news-item__summary">{item.summary}</span>}
                </a>
              ))}
            </div>
          </Section>
        )}
      </div>
    </>
  )
}
