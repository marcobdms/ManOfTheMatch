import { useState } from 'react'
import { ArrowLeft } from '@phosphor-icons/react'
import { useNavigate, useParams } from 'react-router-dom'
import AppHeader from '../components/AppHeader'
import TeamCrest from '../components/TeamCrest'
import StatCompareRow from '../components/StatCompareRow'
import { useFixtureById, useMatchOdds, useMatchPrediction } from '../lib/queries'
import { translateFact } from '../lib/predictions'
import type { TeamStatPair } from '../types/view'

/** Previsión pre-partido: consenso, argumentos de Fotmob, comparativa y
 *  cuotas por casa. Primer intento — solo mercado 1X2, tres casas. */
export default function MatchPredictions() {
  const { fixtureId } = useParams<{ fixtureId: string }>()
  const navigate = useNavigate()
  const matchQuery = useFixtureById(fixtureId)
  const predictionQuery = useMatchPrediction(fixtureId)
  const oddsQuery = useMatchOdds(fixtureId)
  const [bookmakerId, setBookmakerId] = useState<number | null>(null)

  const match = matchQuery.data
  const pred = predictionQuery.data
  const odds = oddsQuery.data ?? []
  const activeBookmaker = odds.find((o) => o.bookmakerId === bookmakerId) ?? odds[0]

  const loading = matchQuery.isLoading || predictionQuery.isLoading || oddsQuery.isLoading
  const hasPercent = pred?.percentHome != null || pred?.percentDraw != null || pred?.percentAway != null
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
          <button type="button" className="motm-iconbtn motm-lineup__back" aria-label="Volver" onClick={() => navigate(-1)}>
            <ArrowLeft size={22} />
          </button>
          <div className="motm-lineup__identity">
            <h1 className="motm-lineup__name">Previsiones</h1>
            {match && (
              <p className="motm-lineup__meta">{match.home.shortName} – {match.away.shortName}</p>
            )}
          </div>
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
              <span className="motm-predict-percent__val">{pred?.percentHome ?? '—'}%</span>
              <span className="motm-predict-percent__val motm-predict-percent__val--draw">{pred?.percentDraw ?? '—'}%</span>
              <span className="motm-predict-percent__val">{pred?.percentAway ?? '—'}%</span>
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
            <div className="motm-segmented" role="group" aria-label="Casa de apuestas">
              {odds.map((o) => (
                <button
                  key={o.bookmakerId}
                  type="button"
                  className="motm-segmented__btn"
                  aria-pressed={activeBookmaker?.bookmakerId === o.bookmakerId}
                  onClick={() => setBookmakerId(o.bookmakerId)}
                >
                  {o.bookmakerName}
                </button>
              ))}
            </div>
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
      </div>
    </>
  )
}
