import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import AppHeader from '../components/AppHeader'
import NewsCard from '../components/NewsCard'
import ScoreboardCard from '../components/ScoreboardCard'
import { Segmented, SegmentedButton } from '../components/Segmented'
import { StaggerItem, StaggerList } from '../components/StaggerList'
import TeamCrest from '../components/TeamCrest'
import { useGoalChips, useLiveMatch, useNews, useStandings, useUpcomingFixtures } from '../lib/queries'
import { useAuth } from '../lib/AuthProvider'
import type { UpcomingMatch } from '../types/view'

const NEXT_MATCHES_LIMIT = 6
const STANDINGS_LIMIT = 10
const NEWS_LIMIT = 12

type Tab = 'noticias' | 'proximos' | 'clasificacion'

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

function Section({ children }: { children: ReactNode }) {
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

  const news = newsQuery.data ?? []
  // Sin noticias todavía (tabla recién estrenada) la pestaña por defecto sería
  // un hueco vacío — se arranca en Próximos hasta que la ingesta llene `news`.
  const [tab, setTab] = useState<Tab>('noticias')
  const active: Tab = tab === 'noticias' && !newsQuery.isLoading && news.length === 0 ? 'proximos' : tab

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

        <Segmented id="home" ariaLabel="Secciones de la portada">
          <SegmentedButton active={active === 'noticias'} onClick={() => setTab('noticias')}>
            Noticias
          </SegmentedButton>
          <SegmentedButton active={active === 'proximos'} onClick={() => setTab('proximos')}>
            Próximos
          </SegmentedButton>
          <SegmentedButton active={active === 'clasificacion'} onClick={() => setTab('clasificacion')}>
            Clasificación
          </SegmentedButton>
        </Segmented>

        {active === 'noticias' && (
          <Section>
            {newsQuery.isLoading && <div className="motm-skel" style={{ height: 260 }} aria-hidden="true" />}

            {!newsQuery.isLoading && news.length === 0 && (
              <p className="motm-note">Todavía no hay noticias publicadas.</p>
            )}

            {news.length > 0 && (
              <div className="motm-news-list">
                {news.map((item, i) => (
                  <NewsCard key={item.id} item={item} hero={i === 0} />
                ))}
              </div>
            )}
          </Section>
        )}

        {active === 'proximos' && (
          <Section>
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
        )}

        {active === 'clasificacion' && (
          <Section>
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
        )}
      </div>
    </>
  )
}
