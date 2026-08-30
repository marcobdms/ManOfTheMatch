import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ChartLineUp, UsersThree } from '@phosphor-icons/react'
import AppHeader from '../components/AppHeader'
import TeamCrest from '../components/TeamCrest'
import { useUpcomingFixtures } from '../lib/queries'
import { useAuth } from '../lib/AuthProvider'
import type { UpcomingMatch } from '../types/view'

const UPCOMING_LIMIT = 30

type Filter = 'all' | 'favorite'

function formatTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '--:--'
  return new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' }).format(date)
}

/** "Hoy" / "Mañana" / "sábado 5 de septiembre" — comparando por fecha local, no por 24h exactas. */
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

function groupByDay(matches: UpcomingMatch[]): { key: string; label: string; matches: UpcomingMatch[] }[] {
  const groups: { key: string; label: string; matches: UpcomingMatch[] }[] = []
  for (const match of matches) {
    const { key, label } = dayKeyAndLabel(match.kickoffAt)
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.matches.push(match)
    else groups.push({ key, label, matches: [match] })
  }
  return groups
}

/** `showPredictions`: solo hoy (sin empezar, ya filtrado por status=SCHEDULED
 *  en la query) y mañana — decidido por el grupo del día (dayKeyAndLabel),
 *  misma comparación de fecha local que ya usa esta vista. */
function MatchRow({ match, showPredictions }: { match: UpcomingMatch; showPredictions: boolean }) {
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

export default function Upcoming() {
  const { profile } = useAuth()
  const storedFavoriteTeamId = profile?.favorite_team_id ?? null
  const [filter, setFilter] = useState<Filter>('all')
  const favoriteTeamId = filter === 'favorite' ? storedFavoriteTeamId : null
  const upcomingQuery = useUpcomingFixtures(UPCOMING_LIMIT, favoriteTeamId)

  const groups = useMemo(() => groupByDay(upcomingQuery.data ?? []), [upcomingQuery.data])

  return (
    <>
      <AppHeader />
      <div className="motm-profile">
        <h1 className="motm-profile__title">Próximos</h1>

        <div className="motm-segmented" role="group" aria-label="Filtrar partidos">
          <button
            type="button"
            className="motm-segmented__btn"
            aria-pressed={filter === 'all'}
            onClick={() => setFilter('all')}
          >
            Todos
          </button>
          <button
            type="button"
            className="motm-segmented__btn"
            aria-pressed={filter === 'favorite'}
            disabled={!storedFavoriteTeamId}
            onClick={() => setFilter('favorite')}
          >
            Solo mi equipo
          </button>
        </div>

        {!storedFavoriteTeamId && (
          <p className="motm-note motm-profile__hint">
            Elige tu equipo favorito en <Link to="/perfil">Perfil</Link> para filtrar aquí.
          </p>
        )}

        {upcomingQuery.isLoading && (
          <div className="motm-skel" style={{ height: 320, margin: '16px 0' }} aria-hidden="true" />
        )}

        {upcomingQuery.isError && (
          <div className="motm-empty" role="status">
            <b>No se pudo cargar</b>
            Inténtalo de nuevo en unos minutos.
          </div>
        )}

        {upcomingQuery.data && groups.length === 0 && (
          <div className="motm-empty" role="status">
            <b>Sin partidos próximos</b>
            {filter === 'favorite' ? 'Tu equipo no tiene partidos programados.' : 'No hay partidos programados por ahora.'}
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
            transition={{ delay: Math.min(gi, 6) * 0.04, duration: 0.22, ease: 'easeOut' }}
          >
            <h2 className="motm-day-group__label">{group.label}</h2>
            <div className="motm-fixture-list">
              {group.matches.map((match) => (
                <MatchRow
                  key={match.id}
                  match={match}
                  showPredictions={group.label === 'Hoy' || group.label === 'Mañana'}
                />
              ))}
            </div>
          </motion.section>
        ))}
      </div>
    </>
  )
}
