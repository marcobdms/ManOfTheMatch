import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import AppHeader from '../components/AppHeader'
import NewsCard from '../components/NewsCard'
import HighlightsCarousel, { HIGHLIGHTS_POOL_LIMIT } from '../components/HighlightsCarousel'
import Reveal, { SkelBlock } from '../components/Reveal'
import ScoreboardCard from '../components/ScoreboardCard'
import LiveFolders from '../components/LiveFolders'
import { Segmented, SegmentedButton } from '../components/Segmented'
import TeamCrest from '../components/TeamCrest'
import {
  isLiveStatus,
  useGoalChips,
  useLiveMatch,
  useLiveMatches,
  useNews,
  useStandings,
  useVideoHighlights,
} from '../lib/queries'
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
  if (isLoading) return <SkelBlock height={220} />
  if (!rows || rows.length === 0) return <p className="motm-note">{emptyNote}</p>
  return (
    <table className="motm-standings motm-reveal">
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
  // Con VARIOS partidos en juego a la vez el hueco destacado pasa a rejilla de
  // carpetas; con uno o ninguno se queda la tarjeta de siempre.
  const allLiveQuery = useLiveMatches({ favoriteTeamId })
  const todayMatches = allLiveQuery.data ?? []
  // Se activan cuando hay 2+ en juego a la vez, pero se pintan TODOS los del
  // día: los que juegan con el punto rojo, el resto con uno gris.
  const showFolders = todayMatches.filter((m) => isLiveStatus(m.status)).length >= 2

  // Hueco destacado: aparece cuando ya se sabe qué partido hay Y sus goles.
  const featureReady =
    !liveQuery.isLoading && !allLiveQuery.isLoading && (!match || !goalsQuery.isLoading)

  const newsQuery = useNews(NEWS_LIMIT)
  // Misma consulta que pinta el carrusel (react-query la comparte): así la
  // sección de noticias espera a carrusel + lista y entra entera.
  const videosQuery = useVideoHighlights(HIGHLIGHTS_POOL_LIMIT)
  const newsReady = !newsQuery.isLoading && !videosQuery.isLoading
  const ligaQuery = useStandings('laliga', STANDINGS_LIMIT)
  // Solo se pide al abrir la pestaña: la tabla de Champions no la mira casi
  // nadie de entrada y son 36 filas.
  const [tab, setTab] = useState<Tab>('noticias')
  const uclQuery = useStandings('ucl', STANDINGS_LIMIT)

  // Los vídeos (topic VIDEO) se ven en el carrusel de arriba, no otra vez
  // sueltos en la lista de debajo.
  const news = (newsQuery.data ?? []).filter((item) => item.topic !== 'VIDEO')
  // Sin noticias todavía la pestaña por defecto sería un hueco vacío: se
  // arranca en LaLiga hasta que la ingesta llene `news`.
  const active: Tab = tab === 'noticias' && !newsQuery.isLoading && news.length === 0 ? 'laliga' : tab

  return (
    <>
      <AppHeader />
      <div className="motm-home">
        {/* Hueco de alto reservado: la tarjeta y la caja de "sin partido"
            ocupan lo mismo, así al resolverse la consulta no se desplaza nada
            de lo de abajo (ni el switcher). */}
        <div className="motm-home__feature">
          <Reveal
            ready={featureReady}
            skeleton={
              <div className="motm-empty motm-empty--loading" role="status">
                <b>Sin partido destacado</b>
                No hay partidos de LaLiga en juego ahora mismo.
              </div>
            }
          >
            {showFolders ? (
              <LiveFolders matches={todayMatches} />
            ) : match ? (
              <ScoreboardCard match={match} goals={goalsQuery.data ?? []} />
            ) : (
              <div className="motm-empty" role="status">
                <b>Sin partido destacado</b>
                No hay partidos de LaLiga en juego ahora mismo.
              </div>
            )}
          </Reveal>
        </div>

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
            <Reveal
              ready={newsReady}
              skeleton={
                <>
                  <SkelBlock height={280} margin="0 0 18px" />
                  <div className="motm-news-list">
                    {[0, 1, 2].map((i) => (
                      <SkelBlock key={i} height={84} />
                    ))}
                  </div>
                </>
              }
            >
              <HighlightsCarousel />

              {news.length === 0 && <p className="motm-note">Todavía no hay noticias publicadas.</p>}

              {news.length > 0 && (
                <div className="motm-news-list">
                  {/* Sin hero aquí: la card grande de arriba ahora es el
                      carrusel de vídeos, el resto se queda en formato pequeño. */}
                  {news.map((item) => (
                    <NewsCard key={item.id} item={item} />
                  ))}
                </div>
              )}
            </Reveal>
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
              <Link to="/clasificacion/champions" className="motm-home__see-all">Ver tabla</Link>
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
