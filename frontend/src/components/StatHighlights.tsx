import { motion, useReducedMotion } from 'framer-motion'
import { PANEL_ENTER } from '../lib/motion'
import type { TeamLite, TeamStatGroup } from '../types/view'

/** Busca una métrica por su clave de Fotmob en todos los grupos del periodo. */
function findStat(groups: TeamStatGroup[], key: string) {
  for (const g of groups) {
    const hit = g.stats.find((s) => s.key === key)
    if (hit) return hit
  }
  return null
}

const RADIUS = 34
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/** Anillo de posesión: la mitad roja es el local, la oscura el visitante. */
function PossessionRing({ homePct }: { homePct: number }) {
  const reduceMotion = useReducedMotion()
  const homeLen = (homePct / 100) * CIRCUMFERENCE

  return (
    <svg viewBox="0 0 80 80" className="motm-hero__ring" role="img" aria-label={`Posesión ${Math.round(homePct)}%`}>
      <circle cx="40" cy="40" r={RADIUS} className="motm-hero__ring-track" />
      <motion.circle
        cx="40"
        cy="40"
        r={RADIUS}
        className="motm-hero__ring-home"
        strokeDasharray={`${homeLen} ${CIRCUMFERENCE - homeLen}`}
        // Arranca arriba y gira en sentido horario, como se lee un reloj.
        transform="rotate(-90 40 40)"
        initial={reduceMotion ? false : { strokeDasharray: `0 ${CIRCUMFERENCE}` }}
        animate={{ strokeDasharray: `${homeLen} ${CIRCUMFERENCE - homeLen}` }}
        transition={reduceMotion ? { duration: 0.001 } : { duration: 0.7, ease: 'easeOut' }}
      />
    </svg>
  )
}

/** Tres cifras destacadas arriba de la comparativa: posesión (anillo), goles
 *  esperados y tiros a puerta. Es lo que se mira primero de un partido, así
 *  que va antes que la lista larga de métricas. */
export default function StatHighlights({
  groups,
  home,
  away,
}: {
  groups: TeamStatGroup[]
  home: TeamLite
  away: TeamLite
}) {
  const reduceMotion = useReducedMotion()
  const possession = findStat(groups, 'BallPossesion')
  const xg = findStat(groups, 'expected_goals')
  const onTarget = findStat(groups, 'ShotsOnTarget')

  if (!possession && !xg && !onTarget) return null

  const homePct = possession ? (possession.home / (possession.home + possession.away || 1)) * 100 : 50

  return (
    <motion.div
      className="motm-hero"
      initial={reduceMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduceMotion ? { duration: 0.001 } : PANEL_ENTER}
    >
      <div className="motm-hero__legend">
        <span className="motm-hero__team">
          <span className="motm-hero__dot motm-hero__dot--home" />
          {home.shortName}
        </span>
        <span className="motm-hero__team motm-hero__team--away">
          {away.shortName}
          <span className="motm-hero__dot motm-hero__dot--away" />
        </span>
      </div>

      <div className="motm-hero__grid">
        {possession && (
          <div className="motm-hero__cell">
            <div className="motm-hero__ring-wrap">
              <PossessionRing homePct={homePct} />
              <span className="motm-hero__ring-val">{Math.round(possession.home)}%</span>
            </div>
            <span className="motm-hero__cell-label">Posesión</span>
            <span className="motm-hero__cell-sub">{Math.round(possession.away)}% rival</span>
          </div>
        )}

        {xg && (
          <div className="motm-hero__cell">
            <span className="motm-hero__pair">
              <b className="motm-hero__num motm-hero__num--home">{xg.home.toFixed(2)}</b>
              <span className="motm-hero__sep">·</span>
              <b className="motm-hero__num motm-hero__num--away">{xg.away.toFixed(2)}</b>
            </span>
            <span className="motm-hero__cell-label">Goles esperados</span>
            <span className="motm-hero__cell-sub">xG</span>
          </div>
        )}

        {onTarget && (
          <div className="motm-hero__cell">
            <span className="motm-hero__pair">
              <b className="motm-hero__num motm-hero__num--home">{Math.round(onTarget.home)}</b>
              <span className="motm-hero__sep">·</span>
              <b className="motm-hero__num motm-hero__num--away">{Math.round(onTarget.away)}</b>
            </span>
            <span className="motm-hero__cell-label">Tiros a puerta</span>
            <span className="motm-hero__cell-sub">de {Math.round((findStat(groups, 'total_shots')?.home ?? 0) + (findStat(groups, 'total_shots')?.away ?? 0))} tiros</span>
          </div>
        )}
      </div>
    </motion.div>
  )
}
