import { Link } from 'react-router-dom'
import TeamCrest from './TeamCrest'
import { isLiveStatus } from '../lib/queries'
import type { LiveMatch } from '../types/view'

/** Cuántos partidos caben antes de resumir el resto en un "+N". */
const MAX_TILES = 9

/**
 * Rejilla de partidos del día, con la pinta de una carpeta de iOS: un cuadrado
 * redondeado por partido con los dos escudos y el marcador. Ocupa el mismo
 * hueco que la tarjeta de un solo partido — no crece.
 *
 * El que está EN JUEGO lleva el punto rojo latiendo (el mismo de la tarjeta de
 * directo); los que aún no han empezado o ya acabaron, un punto gris fijo.
 *
 * Toda la card es UN enlace a "En vivo" (los cuadrados no son enlaces propios:
 * anidar <a> dentro de <a> no es válido y el gesto se vuelve confuso).
 */
export default function LiveFolders({ matches }: { matches: LiveMatch[] }) {
  // En juego primero: son los que interesan de un vistazo.
  const ordered = [...matches].sort(
    (a, b) => Number(isLiveStatus(b.status)) - Number(isLiveStatus(a.status)),
  )
  const shown = ordered.slice(0, MAX_TILES)
  const rest = ordered.length - shown.length
  const liveCount = matches.filter((m) => isLiveStatus(m.status)).length
  // Pocos partidos -> cuadrados grandes centrados; muchos -> rejilla de tres.
  const size = shown.length <= 3 ? 'lg' : 'sm'

  return (
    <Link to="/" className="motm-folders" aria-label={`${matches.length} partidos, ver en vivo`}>
      <div className="motm-folders__top">
        <span className="motm-label motm-folders__label">
          {liveCount > 0 ? `${liveCount} en directo` : `${matches.length} partidos hoy`}
        </span>
        {liveCount > 0 && <span className="motm-live__dot motm-live__dot--red" aria-hidden="true" />}
      </div>

      <div className={`motm-folders__grid motm-folders__grid--${size}`}>
        {shown.map((m) => {
          const live = isLiveStatus(m.status)
          return (
            <span className="motm-folder" key={m.id}>
              <span
                className={live ? 'motm-live__dot motm-live__dot--red' : 'motm-folder__dot'}
                aria-hidden="true"
              />
              <span className="motm-folder__crests">
                <TeamCrest teamId={m.home.id} name={m.home.name} tla={m.home.tla} size={size === 'lg' ? 34 : 26} />
                <TeamCrest teamId={m.away.id} name={m.away.name} tla={m.away.tla} size={size === 'lg' ? 34 : 26} />
              </span>
              <span className="motm-folder__score">
                {live || m.status === 'FINISHED'
                  ? `${m.homeScore ?? 0}-${m.awayScore ?? 0}`
                  : kickoffTime(m.kickoffAt)}
              </span>
            </span>
          )
        })}
        {rest > 0 && (
          <span className="motm-folder motm-folder--more">
            <span className="motm-folder__more">+{rest}</span>
          </span>
        )}
      </div>
    </Link>
  )
}

/** "21:00" — para los que aún no han empezado. */
function kickoffTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' }).format(d)
}
