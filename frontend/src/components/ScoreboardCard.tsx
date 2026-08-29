import { SoccerBall } from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'framer-motion'
import laligaLogo from '../assets/crests/laliga.svg'
import TeamCrest from './TeamCrest'
import { useLiveMinute } from '../lib/useLiveMinute'
import type { GoalChip, LiveMatch } from '../types/view'

type Props = {
  match: LiveMatch
  goals: GoalChip[]
}

/** El marcador "salta" (pop de escala) cuando el número cambia — `key` hace
 *  que React lo remonte y Framer lo anime de entrada. Sin AnimatePresence:
 *  con `popLayout` el número saliente se salía del flujo y descolocaba el
 *  marcador entero justo en el momento del gol. */
function ScoreNumber({ value }: { value: number }) {
  return (
    <motion.b
      key={value}
      initial={{ scale: 1.35 }}
      animate={{ scale: 1 }}
      transition={{ type: 'spring', stiffness: 460, damping: 16 }}
    >
      {value}
    </motion.b>
  )
}

export default function ScoreboardCard({ match, goals }: Props) {
  const isLive = match.status === 'LIVE' || match.status === 'PAUSED'
  // Reloj nativo si hay ancla; si no (recién LIVE, o PAUSED — el reloj se
  // congela en el descanso), cae al minuteLabel que ya trae el backend.
  const liveMinute = useLiveMinute(match.halfStartedAt, match.halfNumber)
  const minuteLabel = liveMinute ?? match.minuteLabel

  return (
    // Sin animación de entrada propia: la transición de página (App.tsx) ya
    // hace el fade de toda la vista, y encadenar ambas producía un doble
    // movimiento en cada carga.
    <section className="motm-score">
      <div className="motm-score__top">
        <span className="motm-label motm-score__comp" style={{ color: 'rgba(255,255,255,.5)' }}>
          {match.competitionShort === 'LaLiga' && (
            <img src={laligaLogo} alt="" className="motm-score__comp-logo" aria-hidden="true" />
          )}
          {match.competitionShort} · {isLive ? 'En directo' : 'Previa'}
        </span>
        {isLive && (
          <span
            className="motm-live"
            role="status"
            aria-atomic="true"
            aria-label={`En directo, minuto ${minuteLabel}`}
          >
            <span className="motm-live__dot" />
            {minuteLabel}
          </span>
        )}
      </div>

      <div className="motm-score__grid">
        <div className="motm-team">
          <TeamCrest teamId={match.home.id} tla={match.home.tla} size={56} className="motm-crest" />
          <span className="motm-team__name">{match.home.shortName}</span>
        </div>
        <div className="motm-score__num">
          <ScoreNumber value={match.homeScore} />
          <span>–</span>
          <ScoreNumber value={match.awayScore} />
        </div>
        <div className="motm-team">
          <TeamCrest teamId={match.away.id} tla={match.away.tla} size={56} className="motm-crest" />
          <span className="motm-team__name">{match.away.shortName}</span>
        </div>
      </div>

      {goals.length > 0 && (
        <div className="motm-goals" aria-label="Goles del partido">
          <AnimatePresence initial={false}>
            {/* Sin `delay` por índice: escalonar aquí re-animaba TODOS los
                chips cada vez que llegaba un gol nuevo. Cada chip entra solo. */}
            {goals.map((g) => (
              <motion.span
                className="motm-goal-chip"
                key={`${g.minuteLabel}-${g.player}`}
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
              >
                <SoccerBall size={12} weight="fill" />
                {g.minuteLabel} {g.player}
              </motion.span>
            ))}
          </AnimatePresence>
        </div>
      )}
    </section>
  )
}
