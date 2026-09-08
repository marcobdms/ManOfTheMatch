import { useState } from 'react'
import { useParams } from 'react-router-dom'
import AppHeader from '../components/AppHeader'
import { Segmented, SegmentedButton } from '../components/Segmented'
import BackButton from '../components/BackButton'
import TeamCrest from '../components/TeamCrest'
import TeamLineupBody from '../components/TeamLineupBody'
import { isLiveStatus, useFixtureById, useMatchLineups, useTeamLineup } from '../lib/queries'

type Side = 'home' | 'away'

/** Alineaciones de un partido: mismo cuerpo (cancha + banquillo) que la
 *  ficha de equipo, con un selector local/visitante en vez de una página
 *  por equipo — recicla TeamLineupBody.
 *
 *  Prioridad de datos: la alineación POR PARTIDO (`lineups`, escrita por
 *  syncMatchFacts) cuando existe — es la única vía para Champions, donde un
 *  lado casi nunca es un club de LaLiga con `team_lineup_snapshots`. Si no
 *  hay, cae al snapshot "probable XI" por equipo (LaLiga, pre-partido). */
export default function MatchLineups() {
  const { fixtureId } = useParams<{ fixtureId: string }>()
  const matchQuery = useFixtureById(fixtureId)
  const match = matchQuery.data
  const live = isLiveStatus(match?.status)

  const [side, setSide] = useState<Side>('home')

  const perFixture = useMatchLineups(fixtureId, { live })
  const homeSnapQuery = useTeamLineup(match?.home.id)
  const awaySnapQuery = useTeamLineup(match?.away.id)

  const homeId = match?.home.id
  const awayId = match?.away.id
  const homeData = (homeId && perFixture.data?.[homeId]) || homeSnapQuery.data
  const awayData = (awayId && perFixture.data?.[awayId]) || awaySnapQuery.data

  const activeData = side === 'home' ? homeData : awayData
  const activeLoading =
    matchQuery.isLoading ||
    perFixture.isLoading ||
    (side === 'home' ? homeSnapQuery.isLoading : awaySnapQuery.isLoading)
  const activeError = side === 'home' ? homeSnapQuery.isError : awaySnapQuery.isError

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
              <TeamCrest teamId={match.home.id} name={match.home.name} tla={match.home.tla} size={18} />
              {match.home.shortName}
            </SegmentedButton>
            <SegmentedButton active={side === 'away'} onClick={() => setSide('away')}>
              <TeamCrest teamId={match.away.id} name={match.away.name} tla={match.away.tla} size={18} />
              {match.away.shortName}
            </SegmentedButton>
          </Segmented>
        )}

        <TeamLineupBody snapshot={activeData} loading={activeLoading} isError={activeError && !activeData} />
      </div>
    </>
  )
}
