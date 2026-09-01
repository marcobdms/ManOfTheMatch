import { useState } from 'react'
import { useParams } from 'react-router-dom'
import AppHeader from '../components/AppHeader'
import { Segmented, SegmentedButton } from '../components/Segmented'
import BackButton from '../components/BackButton'
import TeamCrest from '../components/TeamCrest'
import TeamLineupBody from '../components/TeamLineupBody'
import { useFixtureById, useTeamLineup } from '../lib/queries'

type Side = 'home' | 'away'

/** Alineaciones de un partido: mismo cuerpo (cancha + banquillo) que la
 *  ficha de equipo, con un selector local/visitante en vez de una página
 *  por equipo — recicla TeamLineupBody. */
export default function MatchLineups() {
  const { fixtureId } = useParams<{ fixtureId: string }>()
  const matchQuery = useFixtureById(fixtureId)
  const match = matchQuery.data

  const [side, setSide] = useState<Side>('home')

  const homeQuery = useTeamLineup(match?.home.id)
  const awayQuery = useTeamLineup(match?.away.id)
  const active = side === 'home' ? homeQuery : awayQuery

  return (
    <>
      <AppHeader />
      <div className="motm-lineup">
        <div className="motm-lineup__head">
          <BackButton />
          <div className="motm-lineup__identity">
            <h1 className="motm-lineup__name">Alineaciones</h1>
            {match && (
              <p className="motm-lineup__meta">{match.home.shortName} – {match.away.shortName}</p>
            )}
          </div>
        </div>

        {match && (
          <Segmented id="side" ariaLabel="Equipo">
            <SegmentedButton active={side === 'home'} onClick={() => setSide('home')}>
              <TeamCrest teamId={match.home.id} tla={match.home.tla} size={18} />
              {match.home.shortName}
            </SegmentedButton>
            <SegmentedButton active={side === 'away'} onClick={() => setSide('away')}>
              <TeamCrest teamId={match.away.id} tla={match.away.tla} size={18} />
              {match.away.shortName}
            </SegmentedButton>
          </Segmented>
        )}

        <TeamLineupBody
          snapshot={active.data}
          loading={matchQuery.isLoading || active.isLoading}
          isError={active.isError}
        />
      </div>
    </>
  )
}
