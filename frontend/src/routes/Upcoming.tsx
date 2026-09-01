import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ChartLineUp, UsersThree } from '@phosphor-icons/react'
import AppHeader from '../components/AppHeader'
import { Segmented, SegmentedButton } from '../components/Segmented'
import TeamCrest from '../components/TeamCrest'
import { useFinishedFixtures, useUpcomingFixtures } from '../lib/queries'
import { STAGGER_ITEM } from '../lib/motion'
import type { LiveMatch, UpcomingMatch } from '../types/view'

const FIXTURES_LIMIT = 30

// Debe coincidir con WINDOW_H en backend/src/jobs/syncPredictions.ts — más
// allá de esto el backend ni siquiera pide cuotas/previsión, así que el
// botón no tendría nada que mostrar.
const PREDICTIONS_WINDOW_H = 96

type Scope = 'upcoming' | 'past'

function formatTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '--:--'
  return new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' }).format(date)
}

/** "Hoy" / "Mañana" / "sábado 5 de septiembre" — comparando por fecha local, no por 24h exactas.
 *  Sirve igual para el histórico: un partido de hoy también dice "Hoy". */
function dayKeyAndLabel(iso: string): { key: string; label: string } {
  const date = new Date(iso)
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

  const key = date.toISOString().slice(0, 10)
  if (sameDay(date, today)) return { key, label: 'Hoy' }
  if (sameDay(date, tomorrow)) return { key, label: 'Mañana' }

  const label = new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(date)
  return { key, label: label.charAt(0).toUpperCase() + label.slice(1) }
}

function groupByDay<T extends { kickoffAt: string }>(matches: T[]): { key: string; label: string; matches: T[] }[] {
  const groups: { key: string; label: string; matches: T[] }[] = []
  for (const match of matches) {
    const { key, label } = dayKeyAndLabel(match.kickoffAt)
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.matches.push(match)
    else groups.push({ key, label, matches: [match] })
  }
  return groups
}

/** Horas hasta el kickoff — se compara contra PREDICTIONS_WINDOW_H para
 *  decidir si mostrar el botón (no basta con "SCHEDULED", el backend tampoco
 *  tiene datos más allá de esa ventana). */
function hoursUntil(iso: string): number {
  return (new Date(iso).getTime() - Date.now()) / 3_600_000
}

function UpcomingRow({ match, showPredictions }: { match: UpcomingMatch; showPredictions: boolean }) {
  return (
    <div className="motm-fixture-row">
      <Link to={`/equipos/${match.home.id}`} className="motm-fixture-row__main">
        <span className="motm-fixture-row__time">{formatTime(match.kickoffAt)}</span>
        <span className="motm-fixture-row__team">
          <TeamCrest teamId={match.home.id} tla={match.home.tla} size={24} className="motm-fixture-row__crest" />
          <span className="motm-fixture-row__name">{match.home.shortName}</span>
        </span>
        <span className="motm-fixture-row__vs">–</span>
        <span className="motm-fixture-row__team motm-fixture-row__team--away">
          <span className="motm-fixture-row__name">{match.away.shortName}</span>
          <TeamCrest teamId={match.away.id} tla={match.away.tla} size={24} className="motm-fixture-row__crest" />
        </span>
        <span className="motm-fixture-row__meta">
          {match.competitionShort}
          {match.matchday ? ` · J${match.matchday}` : ''}
        </span>
      </Link>
      {showPredictions && (
        <div className="motm-fixture-row__actions">
          <Link to={`/partidos/${match.id}/previsiones`} className="motm-fixture-row__action">
            <ChartLineUp size={14} weight="bold" />
            Previsiones
          </Link>
          <Link to={`/partidos/${match.id}/alineaciones`} className="motm-fixture-row__action">
            <UsersThree size={14} weight="bold" />
            Alineaciones
          </Link>
        </div>
      )}
    </div>
  )
}

/** Fila de un partido ya jugado — mismo layout que UpcomingRow, cambiando
 *  la hora por el resultado final en el centro. */
function PastRow({ match }: { match: LiveMatch }) {
  return (
    <div className="motm-fixture-row">
      <Link to={`/partidos/${match.id}`} className="motm-fixture-row__main">
        <span className="motm-fixture-row__time">{formatTime(match.kickoffAt)}</span>
        <span className="motm-fixture-row__team">
          <TeamCrest teamId={match.home.id} tla={match.home.tla} size={24} className="motm-fixture-row__crest" />
          <span className="motm-fixture-row__name">{match.home.shortName}</span>
        </span>
        <span className="motm-fixture-row__vs motm-fixture-row__vs--score">
          {match.homeScore}–{match.awayScore}
        </span>
        <span className="motm-fixture-row__team motm-fixture-row__team--away">
          <span className="motm-fixture-row__name">{match.away.shortName}</span>
          <TeamCrest teamId={match.away.id} tla={match.away.tla} size={24} className="motm-fixture-row__crest" />
        </span>
        <span className="motm-fixture-row__meta">{match.competitionShort}</span>
      </Link>
    </div>
  )
}

export default function Upcoming() {
  // El alcance vive en la URL (?pasados) y no en estado local: al volver con
  // la flecha desde el detalle de un partido jugado, el navegador restaura
  // esta ruta tal cual estaba y se sigue viendo "Pasados" en vez de saltar
  // otra vez a "Próximos".
  const [params, setParams] = useSearchParams()
  const scope: Scope = params.get('ver') === 'pasados' ? 'past' : 'upcoming'
  const setScope = (next: Scope) => {
    setParams(next === 'past' ? { ver: 'pasados' } : {}, { replace: true })
  }

  const upcomingQuery = useUpcomingFixtures(FIXTURES_LIMIT)
  const pastQuery = useFinishedFixtures(FIXTURES_LIMIT)
  const query = scope === 'upcoming' ? upcomingQuery : pastQuery

  const upcomingGroups = useMemo(() => groupByDay(upcomingQuery.data ?? []), [upcomingQuery.data])
  const pastGroups = useMemo(() => groupByDay(pastQuery.data ?? []), [pastQuery.data])
  const groups = scope === 'upcoming' ? upcomingGroups : pastGroups

  return (
    <>
      <AppHeader />
      <div className="motm-profile">
        <h1 className="motm-profile__title">{scope === 'upcoming' ? 'Próximos' : 'Pasados'}</h1>

        <Segmented id="scope" ariaLabel="Próximos o pasados">
          <SegmentedButton active={scope === 'upcoming'} onClick={() => setScope('upcoming')}>
            Próximos
          </SegmentedButton>
          <SegmentedButton active={scope === 'past'} onClick={() => setScope('past')}>
            Pasados
          </SegmentedButton>
        </Segmented>

        {query.isLoading && (
          <div className="motm-skel" style={{ height: 320, margin: '16px 0' }} aria-hidden="true" />
        )}

        {query.isError && (
          <div className="motm-empty" role="status">
            <b>No se pudo cargar</b>
            Inténtalo de nuevo en unos minutos.
          </div>
        )}

        {query.data && groups.length === 0 && scope === 'upcoming' && (
          <div className="motm-empty" role="status">
            <b>Sin partidos próximos</b>
            No hay partidos programados por ahora.
          </div>
        )}

        {query.data && groups.length === 0 && scope === 'past' && (
          <div className="motm-empty" role="status">
            <b>Sin partidos jugados todavía</b>
            Todavía no hay partidos jugados esta temporada.
          </div>
        )}

        {groups.map((group, gi) => (
          // Fade corto sin desplazamiento: la vista ya entra animada desde
          // App.tsx, y un `y` extra aquí duplicaba el movimiento al cambiar
          // de filtro (que es cuando más se nota, porque los grupos cambian).
          <motion.section
            key={group.key}
            className="motm-day-group"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: Math.min(gi, 6) * 0.04, ...STAGGER_ITEM }}
          >
            <h2 className="motm-day-group__label">{group.label}</h2>
            <div className="motm-fixture-list">
              {scope === 'upcoming'
                ? (group.matches as UpcomingMatch[]).map((match) => (
                    <UpcomingRow
                      key={match.id}
                      match={match}
                      showPredictions={hoursUntil(match.kickoffAt) <= PREDICTIONS_WINDOW_H}
                    />
                  ))
                : (group.matches as LiveMatch[]).map((match) => <PastRow key={match.id} match={match} />)}
            </div>
          </motion.section>
        ))}
      </div>
    </>
  )
}
