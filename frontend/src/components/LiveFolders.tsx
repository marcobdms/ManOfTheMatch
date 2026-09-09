import { Link } from 'react-router-dom'
import TeamCrest from './TeamCrest'
import { isLiveStatus } from '../lib/queries'
import type { LiveMatch } from '../types/view'

/** Cuántos partidos caben antes de resumir el resto en un "+N". */
const MAX_TILES = 6

/**
 * Rejilla de partidos simultáneos, con la pinta de una carpeta de iOS: un
 * cuadrado redondeado por partido con los dos escudos y el marcador. Ocupa el
 * mismo hueco que la tarjeta de un solo partido — no crece.
 *
 * Con pocos partidos los cuadrados son más grandes y van centrados; a partir
 * de cuatro pasa a rejilla de tres columnas. Toda la card es UN enlace a "En
 * vivo" (los cuadrados no son enlaces propios: anidar <a> dentro de <a> no es
 * válido y el gesto se vuelve confuso).
 */
export default function LiveFolders({ matches }: { matches: LiveMatch[] }) {
  const shown = matches.slice(0, MAX_TILES)
  const rest = matches.length - shown.length
  const liveCount = matches.filter((m) => isLiveStatus(m.status)).length
  // 2-3 partidos -> cuadrados grandes en una fila; 4+ -> rejilla de 3.
  const size = shown.length <= 3 ? 'lg' : 'sm'

  return (
    <Link to="/en-vivo" className="motm-folders" aria-label={`${matches.length} partidos, ver en vivo`}>
      <div className="motm-folders__top">
        <span className="motm-label motm-folders__label">
          {liveCount > 0 ? `${liveCount} en directo` : `${matches.length} partidos hoy`}
        </span>
        {liveCount > 0 && <span className="motm-live__dot" aria-hidden="true" />}
      </div>

      <div className={`motm-folders__grid motm-folders__grid--${size}`}>
        {shown.map((m) => (
          <span className="motm-folder" key={m.id}>
            <span className="motm-folder__crests">
              <TeamCrest teamId={m.home.id} name={m.home.name} tla={m.home.tla} size={size === 'lg' ? 34 : 26} />
              <TeamCrest teamId={m.away.id} name={m.away.name} tla={m.away.tla} size={size === 'lg' ? 34 : 26} />
            </span>
            <span className="motm-folder__score">
              {isLiveStatus(m.status) || m.status === 'FINISHED'
                ? `${m.homeScore ?? 0}-${m.awayScore ?? 0}`
                : kickoffTime(m.kickoffAt)}
            </span>
          </span>
        ))}
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
