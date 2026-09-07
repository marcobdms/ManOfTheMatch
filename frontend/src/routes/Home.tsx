import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import AppHeader from '../components/AppHeader'
import NewsCard from '../components/NewsCard'
import ScoreboardCard from '../components/ScoreboardCard'
import { Segmented, SegmentedButton } from '../components/Segmented'
import TeamCrest from '../components/TeamCrest'
import { useGoalChips, useLiveMatch, useNews, useStandings } from '../lib/queries'
import { useAuth } from '../lib/AuthProvider'
import { crestForUclTeam } from '../lib/crestsUcl'
import laligaLogo from '../assets/crests/laliga.svg'
import championsLogo from '../assets/crests/champions.svg'
import type { StandingRow } from '../types/view'

const STANDINGS_LIMIT = 20
const NEWS_LIMIT = 12

// Próximos partidos ya tiene su propia pestaña en el navbar, así que aquí el
// hueco lo aprovechan las dos tablas.
type Tab = 'noticias' | 'laliga' | 'champions'

function Section({ children }: { children: ReactNode }) {
  return <section className="motm-home__section">{children}</section>
}

function StandingsTable({
  rows,
  isLoading,
  emptyNote,
  competition,
}: {
  rows: StandingRow[] | undefined
  isLoading: boolean
  emptyNote: string
  competition: 'laliga' | 'ucl'
}) {
  if (isLoading) return <div className="motm-skel" style={{ height: 220 }} aria-hidden="true" />
  if (!rows || rows.length === 0) return <p className="motm-note">{emptyNote}</p>
  return (
    <table className="motm-standings">
      <tbody>
        {rows.map((row) => {
          // En Champions las filas no traen slug (solo los clubes españoles),
          // así que el escudo se busca por nombre.
          const tla = row.tla ?? row.teamName.slice(0, 3).toUpperCase()
          return (
            <tr key={row.teamId ?? row.teamName}>
              <td className="motm-standings__pos">{row.position}</td>
              <td className="motm-standings__crest">
                <TeamCrest
                  teamId={row.teamId ?? undefined}
                  tla={tla}
                  size={20}
                  src={competition === 'ucl' ? crestForUclTeam(row.teamName) : undefined}
                />
              </td>
              <td className="motm-standings__name">{row.teamName}</td>
              <td className="motm-standings__played">{row.played ?? '—'}</td>
              <td className="motm-standings__pts">{row.points ?? '—'}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

export default function Home() {
  const { profile } = useAuth()
  const favoriteTeamId = profile?.favorite_team_id ?? null
  const liveQuery = useLiveMatch({ favoriteTeamId })
  const match = liveQuery.data
  const goalsQuery = useGoalChips(match?.id, { enabled: !!match })

  const newsQuery = useNews(NEWS_LIMIT)
  const ligaQuery = useStandings('laliga', STANDINGS_LIMIT)
  // Solo se pide al abrir la pestaña: la tabla de Champions no la mira casi
  // nadie de entrada y son 36 filas.
  const [tab, setTab] = useState<Tab>('noticias')
  const uclQuery = useStandings('ucl', STANDINGS_LIMIT)

  const news = newsQuery.data ?? []
  // Sin noticias todavía la pestaña por defecto sería un hueco vacío: se
  // arranca en LaLiga hasta que la ingesta llene `news`.
  const active: Tab = tab === 'noticias' && !newsQuery.isLoading && news.length === 0 ? 'laliga' : tab

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
          <SegmentedButton active={active === 'laliga'} onClick={() => setTab('laliga')}>
            <img src={laligaLogo} alt="LaLiga" className="motm-seg-comp__logo" />
          </SegmentedButton>
          <SegmentedButton active={active === 'champions'} onClick={() => setTab('champions')}>
            <img
              src={championsLogo}
              alt="Champions"
              className="motm-seg-comp__logo motm-seg-comp__logo--invert"
            />
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

        {active === 'laliga' && (
          <Section>
            <div className="motm-home__section-head">
              <h2 className="motm-label">Clasificación · LaLiga</h2>
              <Link to="/clasificacion" className="motm-home__see-all">Ver tabla</Link>
            </div>
            <StandingsTable
              rows={ligaQuery.data}
              competition="laliga"
              isLoading={ligaQuery.isLoading}
              emptyNote="Todavía no hay clasificación disponible."
            />
          </Section>
        )}

        {active === 'champions' && (
          <Section>
            <div className="motm-home__section-head">
              <h2 className="motm-label">Clasificación · Champions</h2>
            </div>
            <StandingsTable
              rows={uclQuery.data}
              competition="ucl"
              isLoading={uclQuery.isLoading}
              emptyNote="La fase de liga de la Champions aún no ha empezado."
            />
          </Section>
        )}
      </div>
    </>
  )
}
