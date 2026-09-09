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
 * Los escudos son "burbujas": cada una flota con su propio ritmo (duración,
 * fase y amplitud aleatorias por escudo, semilla estable) para que no bailen
 * al unísono. El del equipo que va ganando se pinta más grande.
 *
 * El que está EN JUEGO lleva el punto rojo latiendo; los demás, un punto gris.
 * Toda la card es UN enlace a "En vivo" (los cuadrados no son enlaces: anidar
 * <a> dentro de <a> no es válido y el gesto se vuelve confuso).
 */
export default function LiveFolders({ matches }: { matches: LiveMatch[] }) {
  const ordered = [...matches].sort(
    (a, b) => Number(isLiveStatus(b.status)) - Number(isLiveStatus(a.status)),
  )
  const shown = ordered.slice(0, MAX_TILES)
  const rest = ordered.length - shown.length
  const liveCount = matches.filter((m) => isLiveStatus(m.status)).length
  const size = shown.length <= 3 ? 'lg' : 'sm'
  const crest = size === 'lg' ? 56 : 36

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
          const scored = live || m.status === 'FINISHED'
          const homeLead = scored && (m.homeScore ?? 0) > (m.awayScore ?? 0)
          const awayLead = scored && (m.awayScore ?? 0) > (m.homeScore ?? 0)
          return (
            <span className="motm-folder" key={m.id}>
              <span
                className={live ? 'motm-live__dot motm-live__dot--red' : 'motm-folder__dot'}
                aria-hidden="true"
              />
              <span className="motm-folder__crests">
                <Bubble seed={m.id + 'h'} lead={homeLead}>
                  <TeamCrest teamId={m.home.id} name={m.home.name} tla={m.home.tla} size={crest} />
                </Bubble>
                <Bubble seed={m.id + 'a'} lead={awayLead}>
                  <TeamCrest teamId={m.away.id} name={m.away.name} tla={m.away.tla} size={crest} />
                </Bubble>
              </span>
              <span className="motm-folder__score">
                {scored ? `${m.homeScore ?? 0}-${m.awayScore ?? 0}` : kickoffTime(m.kickoffAt)}
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

/** RNG determinista a partir de un string — mismas burbujas en cada render. */
function rand(seed: string): () => number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return () => {
    h += 0x6d2b79f5
    let t = Math.imul(h ^ (h >>> 15), 1 | h)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Escudo "burbuja": flota con ritmo y trayectoria propios (semilla estable).
 *  `lead` lo agranda; se apaga con prefers-reduced-motion. */
function Bubble({
  children,
  seed,
  lead,
}: {
  children: React.ReactNode
  seed: string
  lead: boolean
}) {
  const r = rand(seed)
  const dur = 2.8 + r() * 2.2 // 2.8–5.0 s
  const delay = -r() * 6 // arranca en un punto distinto del ciclo
  const bx = (2.5 + r() * 3).toFixed(1) // amplitud X 2.5–5.5 px
  const by = (3 + r() * 4).toFixed(1) // amplitud Y 3–7 px
  const br = (1.5 + r() * 2.5).toFixed(1) // giro 1.5–4 deg
  const rev = r() > 0.5 ? 'reverse' : 'normal'
  return (
    <span
      className={'motm-bubble' + (lead ? ' motm-bubble--lead' : '')}
      style={
        {
          animationDuration: `${dur.toFixed(2)}s`,
          animationDelay: `${delay.toFixed(2)}s`,
          animationDirection: rev,
          '--bx': `${bx}px`,
          '--by': `${by}px`,
          '--br': `${br}deg`,
        } as React.CSSProperties
      }
    >
      {children}
    </span>
  )
}

/** "21:00" — para los que aún no han empezado. */
function kickoffTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' }).format(d)
}
