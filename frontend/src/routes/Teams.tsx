import { useState } from 'react'
import { Link } from 'react-router-dom'
import AppHeader from '../components/AppHeader'
import { Segmented, SegmentedButton } from '../components/Segmented'
import { StaggerItem, StaggerList } from '../components/StaggerList'
import TeamCrest from '../components/TeamCrest'
import { useTeams } from '../lib/queries'
import { TEAMS, UCL_TEAMS } from '../lib/shared'
import laligaLogo from '../assets/crests/laliga.svg'
import championsLogo from '../assets/crests/champions.svg'

type Comp = 'laliga' | 'champions'

// Los 5 clubes de LaLiga que juegan Champions salen en las dos pestañas.
const UCL_SHARED = new Set(['real-madrid', 'barcelona', 'atletico-madrid', 'real-betis', 'villarreal'])
const inLaliga = (id: string) => id in TEAMS
const inChampions = (id: string) => id in UCL_TEAMS || UCL_SHARED.has(id)

export default function Teams() {
  const teamsQuery = useTeams()
  const [comp, setComp] = useState<Comp>('laliga')

  const all = teamsQuery.data ?? []
  const teams = all.filter((t) => (comp === 'laliga' ? inLaliga(t.id) : inChampions(t.id)))

  return (
    <>
      <AppHeader />
      <div className="motm-profile">
        <h1 className="motm-profile__title">Equipos</h1>

        <Segmented id="teams-comp" ariaLabel="LaLiga o Champions">
          <SegmentedButton active={comp === 'laliga'} onClick={() => setComp('laliga')}>
            <img src={laligaLogo} alt="LaLiga" className="motm-seg-comp__logo" />
          </SegmentedButton>
          <SegmentedButton active={comp === 'champions'} onClick={() => setComp('champions')}>
            <img
              src={championsLogo}
              alt="Champions"
              className="motm-seg-comp__logo motm-seg-comp__logo--invert"
            />
          </SegmentedButton>
        </Segmented>

        {teamsQuery.isLoading && (
          <div className="motm-skel" style={{ height: 320, marginTop: 16 }} aria-hidden="true" />
        )}
        {teamsQuery.data && (
          <StaggerList className="motm-team-list">
            {teams.map((t) => (
              <StaggerItem key={t.id}>
                <Link to={`/equipos/${t.id}`} className="motm-team-row">
                  <TeamCrest teamId={t.id} name={t.name} tla={t.tla} color={t.primary_color} size={32} />
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
