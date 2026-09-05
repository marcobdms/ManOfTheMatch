import { useState } from 'react'
import { CaretDown, CheckCircle, Sparkle, XCircle } from '@phosphor-icons/react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useParams } from 'react-router-dom'
import AppHeader from '../components/AppHeader'
import { Segmented, SegmentedButton } from '../components/Segmented'
import BackButton from '../components/BackButton'
import MatchAlertToggle from '../components/MatchAlertToggle'
import TeamCrest from '../components/TeamCrest'
import StatCompareRow from '../components/StatCompareRow'
import { useFixtureById, useGenerateAiPrediction, useMatchOdds, useMatchPrediction } from '../lib/queries'
import { PANEL_ENTER } from '../lib/motion'
import { impliedResultPercent, translateFact } from '../lib/predictions'
import type { TeamStatPair } from '../types/view'

/** Previsión pre-partido: consenso, argumentos de Fotmob, comparativa y
 *  cuotas por casa. Primer intento — solo mercado 1X2, tres casas. */
export default function MatchPredictions() {
  const { fixtureId } = useParams<{ fixtureId: string }>()
  const matchQuery = useFixtureById(fixtureId)
  const predictionQuery = useMatchPrediction(fixtureId)
  const oddsQuery = useMatchOdds(fixtureId)
  // De momento sin caché (petición explícita): el resultado vive solo en el
  // estado de esta mutación, así que al salir de la vista y volver (o dar
  // "Generar otra") se pide una previsión nueva de verdad, no una guardada.
  const generateAi = useGenerateAiPrediction()
  const [bookmakerId, setBookmakerId] = useState<number | null>(null)
  const [aiOpen, setAiOpen] = useState(true)
  const reduceMotion = useReducedMotion()

  const match = matchQuery.data
  const pred = predictionQuery.data
  const odds = oddsQuery.data ?? []
  const ai = generateAi.data
  const activeBookmaker = odds.find((o) => o.bookmakerId === bookmakerId) ?? odds[0]

  const loading = matchQuery.isLoading || predictionQuery.isLoading || oddsQuery.isLoading
  // Preferimos la probabilidad implícita de las cuotas reales al "percent" de
  // API-Football (ver lib/predictions.ts) — solo caemos a ese si no hay cuotas.
  const implied = impliedResultPercent(odds)
  const percentHome = implied?.home ?? pred?.percentHome ?? null
  const percentDraw = implied?.draw ?? pred?.percentDraw ?? null
  const percentAway = implied?.away ?? pred?.percentAway ?? null
  const hasPercent = percentHome != null || percentDraw != null || percentAway != null
  const hasComparison = pred?.formHome != null
  const hasAnything = hasPercent || hasComparison || (pred?.facts.length ?? 0) > 0 || odds.length > 0

  const comparisonRows: TeamStatPair[] = match && pred
    ? [
        { key: 'form', label: 'Forma (últimos 5)', home: pred.formHome ?? 0, away: pred.formAway ?? 0, isPercent: true },
        { key: 'att', label: 'Ataque', home: pred.attHome ?? 0, away: pred.attAway ?? 0, isPercent: true },
        { key: 'def', label: 'Defensa', home: pred.defHome ?? 0, away: pred.defAway ?? 0, isPercent: true },
      ].filter((r) => r.home > 0 || r.away > 0)
    : []

  return (
    <>
      <AppHeader />
      <div className="motm-lineup">
        <div className="motm-lineup__head">
          <BackButton />
          <div className="motm-lineup__identity">
            <h1 className="motm-lineup__name">Previsiones</h1>
            {match && (
              <p className="motm-lineup__meta">{match.home.shortName} – {match.away.shortName}</p>
            )}
          </div>

          {/* Avisos solo de este partido: aquí, antes del pitido inicial, es
              cuando de verdad decides si vas a seguirlo. */}
          <MatchAlertToggle fixtureId={fixtureId} />
        </div>

        {loading && <div className="motm-skel" style={{ height: 260, margin: '16px' }} aria-hidden="true" />}

        {!loading && !hasAnything && (
          <div className="motm-empty">
            <b>Sin previsiones todavía</b>
            Se publican en las horas previas al partido. Vuelve más tarde.
          </div>
        )}

        {!loading && match && hasPercent && (
          <div className="motm-compare">
            <div className="motm-compare__head">
              <TeamCrest teamId={match.home.id} tla={match.home.tla} size={28} />
              <span className="motm-label">Quién gana</span>
              <TeamCrest teamId={match.away.id} tla={match.away.tla} size={28} />
            </div>
            <div className="motm-predict-percent">
              <span className="motm-predict-percent__val">{percentHome ?? '—'}%</span>
              <span className="motm-predict-percent__val motm-predict-percent__val--draw">{percentDraw ?? '—'}%</span>
              <span className="motm-predict-percent__val">{percentAway ?? '—'}%</span>
            </div>
          </div>
        )}

        {!loading && (pred?.facts.length ?? 0) > 0 && match && (
          <div className="motm-stat-team">
            <h2 className="motm-label motm-subs__title">Argumentos</h2>
            <ul className="motm-predict-facts">
              {pred!.facts.map((fact, i) => {
                const text = translateFact(fact, match.home.shortName, match.away.shortName)
                return text ? <li key={i}>{text}</li> : null
              })}
            </ul>
          </div>
        )}

        {!loading && comparisonRows.length > 0 && (
          <div className="motm-compare">
            <div className="motm-compare__rows">
              {comparisonRows.map((pair) => (
                <StatCompareRow key={pair.key} pair={pair} />
              ))}
            </div>
          </div>
        )}

        {!loading && odds.length > 0 && (
          <div className="motm-stat-team">
            <h2 className="motm-label motm-subs__title">Cuotas 1X2</h2>
            <Segmented id="bookmaker" ariaLabel="Casa de apuestas">
              {odds.map((o) => (
                <SegmentedButton
                  key={o.bookmakerId}
                  active={activeBookmaker?.bookmakerId === o.bookmakerId}
                  onClick={() => setBookmakerId(o.bookmakerId)}
                >
                  {o.bookmakerName}
                </SegmentedButton>
              ))}
            </Segmented>
            {activeBookmaker && match && (
              <div className="motm-predict-odds">
                <div className="motm-predict-odds__col">
                  <TeamCrest teamId={match.home.id} tla={match.home.tla} size={24} />
                  <span>{activeBookmaker.home.toFixed(2)}</span>
                </div>
                <div className="motm-predict-odds__col">
                  <span className="motm-predict-odds__label">Empate</span>
                  <span>{activeBookmaker.draw.toFixed(2)}</span>
                </div>
                <div className="motm-predict-odds__col">
                  <TeamCrest teamId={match.away.id} tla={match.away.tla} size={24} />
                  <span>{activeBookmaker.away.toFixed(2)}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Solo la casa que falta desaparece de arriba (ya viene filtrada
            desde el backend) — esto es para cuando NINGUNA tiene cuotas
            todavía pero sí hay otra previsión que mostrar, para no dejar un
            hueco sin explicación entre "Argumentos" y la previsión IA. */}
        {!loading && odds.length === 0 && (hasPercent || hasComparison || (pred?.facts.length ?? 0) > 0) && (
          <div className="motm-stat-team">
            <h2 className="motm-label motm-subs__title">Cuotas 1X2</h2>
            <p className="motm-note">Sin datos de casas de apuestas todavía.</p>
          </div>
        )}

        {!loading && hasAnything && fixtureId && (
          <div className="motm-compare motm-ai">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                // La clave cambia al pasar de "sin previsión" a "con
                // previsión": AnimatePresence desvanece lo viejo y entra lo
                // nuevo, en vez del corte seco de antes.
                key={ai ? 'ready' : generateAi.isPending ? 'pending' : 'idle'}
                initial={reduceMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={reduceMotion ? { duration: 0.001 } : PANEL_ENTER}
              >
            {ai ? (
              <button
                type="button"
                className={'motm-ai__toggle' + (aiOpen ? '' : ' is-collapsed')}
                aria-expanded={aiOpen}
                aria-controls="motm-ai-body"
                onClick={() => setAiOpen((v) => !v)}
              >
                <span className="motm-ai__head">
                  <Sparkle size={14} weight="fill" />
                  <span className="motm-ai__badge">Previsión IA</span>
                </span>
                <CaretDown size={16} weight="bold" className={'motm-ai__caret' + (aiOpen ? ' is-open' : '')} />
              </button>
            ) : (
              <div className="motm-ai__head">
                <Sparkle size={14} weight="fill" />
                <span className="motm-ai__badge">Previsión IA</span>
              </div>
            )}

            {ai ? (
              <AnimatePresence initial={false}>
                {aiOpen && (
                  <motion.div
                    id="motm-ai-body"
                    className="motm-ai__body"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={reduceMotion ? { duration: 0.001 } : PANEL_ENTER}
                  >
                {match && ai.predictedResult !== 'draw' && (
                  <div className="motm-ai__pick">
                    <TeamCrest
                      teamId={ai.predictedResult === 'home' ? match.home.id : match.away.id}
                      tla={ai.predictedResult === 'home' ? match.home.tla : match.away.tla}
                      size={22}
                    />
                    <span>Gana {ai.predictedResult === 'home' ? match.home.shortName : match.away.shortName}</span>
                  </div>
                )}
                {ai.predictedResult === 'draw' && <div className="motm-ai__pick">Empate</div>}

                <p className="motm-ai__paragraph">{ai.paragraph}</p>

                {ai.pros.length > 0 && (
                  <ul className="motm-ai__list motm-ai__list--pro">
                    {ai.pros.map((p, i) => (
                      <li key={i}>
                        <CheckCircle size={15} weight="fill" />
                        <span>{p}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {ai.cons.length > 0 && (
                  <ul className="motm-ai__list motm-ai__list--con">
                    {ai.cons.map((c, i) => (
                      <li key={i}>
                        <XCircle size={15} weight="fill" />
                        <span>{c}</span>
                      </li>
                    ))}
                  </ul>
                )}

                <button
                  type="button"
                  className="motm-ai__retry"
                  disabled={generateAi.isPending}
                  onClick={() => generateAi.mutate(fixtureId)}
                >
                  {generateAi.isPending ? 'Generando…' : 'Generar otra previsión'}
                </button>
                  </motion.div>
                )}
              </AnimatePresence>
            ) : (
              <>
                <button
                  type="button"
                  className="motm-btn motm-ai__generate"
                  disabled={generateAi.isPending}
                  onClick={() => generateAi.mutate(fixtureId)}
                >
                  <Sparkle size={18} weight="fill" />
                  {generateAi.isPending ? 'Generando…' : 'Generar previsión con IA'}
                </button>
                {generateAi.isError && (
                  <p className="motm-field__error">{(generateAi.error as Error).message}</p>
                )}
              </>
            )}
              </motion.div>
            </AnimatePresence>
          </div>
        )}
      </div>
    </>
  )
}
