import { useParams } from 'react-router-dom'
import AppHeader from '../components/AppHeader'
import BackButton from '../components/BackButton'
import LiveMatchView from '../components/LiveMatchView'
import { useFixtureById } from '../lib/queries'

/**
 * Directo de un partido concreto — se llega desde la lista de "En vivo"
 * cuando hay varios a la vez. Misma vista que la pestaña En vivo con un solo
 * partido, con una flecha para volver.
 */
export default function LiveMatchRoute() {
  const { fixtureId } = useParams<{ fixtureId: string }>()
  const { data: match, isLoading } = useFixtureById(fixtureId)

  return (
    <>
      <AppHeader />
      <div style={{ padding: '4px 0 0 10px' }}>
        <BackButton />
      </div>

      {isLoading && <div className="motm-skel" aria-hidden="true" />}

      {!isLoading && !match && (
        <div className="motm-empty" role="status">
          <b>Partido no encontrado</b>
          Puede que ya haya terminado.
        </div>
      )}

      {match && <LiveMatchView match={match} />}
    </>
  )
}
