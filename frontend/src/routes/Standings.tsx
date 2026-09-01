import { Link } from 'react-router-dom'
import AppHeader from '../components/AppHeader'
import BackButton from '../components/BackButton'
import TeamCrest from '../components/TeamCrest'
import { StaggerItem, StaggerList } from '../components/StaggerList'
import { useStandings } from '../lib/queries'
import type { StandingRow } from '../types/view'

// LaLiga: 4 primeros a Champions, 5º Europa League, 6º Conference, 3 últimos
// descienden. Solo colorea el borde — la posición ya va escrita al lado.
function zoneClass(position: number, total: number): string {
  if (position <= 4) return ' is-ucl'
  if (position === 5) return ' is-uel'
  if (position === 6) return ' is-conf'
  if (total > 3 && position > total - 3) return ' is-drop'
  return ''
}

function FormPill({ form }: { form: string }) {
  // La fuente manda "W,D,W" (con comas), no "WDW" — se limpia todo lo que no
  // sea resultado y se cogen los 5 últimos, del más antiguo al más reciente.
  const results = form.replace(/[^WDL]/gi, '').toUpperCase().slice(-5).split('')
  return (
    <span className="motm-table__form">
      {results.map((r, i) => (
        <span key={i} className={'motm-table__form-dot motm-table__form-dot--' + r.toLowerCase()} title={r}>
          {r === 'W' ? 'V' : r === 'D' ? 'E' : 'D'}
        </span>
      ))}
    </span>
  )
}

function Row({ row, total }: { row: StandingRow; total: number }) {
  const inner = (
    <>
      <span className={'motm-table__pos' + zoneClass(row.position, total)}>{row.position}</span>
      <TeamCrest teamId={row.teamId ?? undefined} tla={row.tla ?? '—'} size={22} className="motm-table__crest" />
      <span className="motm-table__name">{row.teamName}</span>
      <span className="motm-table__num">{row.played ?? '—'}</span>
      <span className="motm-table__num motm-table__num--record">
        {row.won ?? '—'}-{row.draw ?? '—'}-{row.lost ?? '—'}
      </span>
      <span className="motm-table__num">
        {row.goalDiff == null ? '—' : row.goalDiff > 0 ? `+${row.goalDiff}` : row.goalDiff}
      </span>
      <span className="motm-table__num motm-table__num--pts">{row.points ?? '—'}</span>
    </>
  )

  // Sin `teamId` (equipo no seguido) no hay ficha a la que llevar.
  return row.teamId ? (
    <Link to={`/equipos/${row.teamId}`} className="motm-table__row">
      {inner}
    </Link>
  ) : (
    <div className="motm-table__row">{inner}</div>
  )
}

/** Clasificación completa de LaLiga — desde "Ver tabla" en Home. Una sola
 *  lectura de `standings` (la instantánea más reciente), sin cálculos propios:
 *  los puntos y el golaverage vienen ya hechos de la fuente. */
export default function Standings() {
  const standingsQuery = useStandings('laliga', 30)
  const rows = standingsQuery.data ?? []
  const withForm = rows.filter((r) => r.form)

  return (
    <>
      <AppHeader />
      <div className="motm-lineup">
        <div className="motm-lineup__head">
          <BackButton />
          <div className="motm-lineup__identity">
            <h1 className="motm-lineup__name">Clasificación</h1>
            <p className="motm-lineup__meta">LaLiga</p>
          </div>
        </div>

        {standingsQuery.isLoading && (
          <div className="motm-skel" style={{ height: 420, margin: '0 16px' }} aria-hidden="true" />
        )}

        {!standingsQuery.isLoading && rows.length === 0 && (
          <div className="motm-empty">
            <b>Sin clasificación todavía</b>
            Aún no hay una tabla publicada para esta temporada.
          </div>
        )}

        {rows.length > 0 && (
          <div className="motm-table">
            <div className="motm-table__head">
              <span className="motm-table__pos">#</span>
              <span />
              <span className="motm-table__name">Equipo</span>
              <span className="motm-table__num">PJ</span>
              <span className="motm-table__num motm-table__num--record">V-E-D</span>
              <span className="motm-table__num">DG</span>
              <span className="motm-table__num motm-table__num--pts">PTS</span>
            </div>

            <StaggerList className="motm-table__body">
              {rows.map((row) => (
                <StaggerItem key={row.teamId ?? row.teamName}>
                  <Row row={row} total={rows.length} />
                </StaggerItem>
              ))}
            </StaggerList>

            {withForm.length > 0 && (
              <div className="motm-table__form-block">
                <h2 className="motm-label motm-subs__title">Racha (últimos 5)</h2>
                {withForm.map((row) => (
                  <div className="motm-table__form-row" key={`form-${row.teamId ?? row.teamName}`}>
                    <TeamCrest teamId={row.teamId ?? undefined} tla={row.tla ?? '—'} size={20} />
                    <span className="motm-table__name">{row.teamName}</span>
                    <FormPill form={row.form!} />
                  </div>
                ))}
              </div>
            )}

            <div className="motm-table__legend">
              <span><i className="motm-table__key is-ucl" /> Champions</span>
              <span><i className="motm-table__key is-uel" /> Europa League</span>
              <span><i className="motm-table__key is-conf" /> Conference</span>
              <span><i className="motm-table__key is-drop" /> Descenso</span>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
