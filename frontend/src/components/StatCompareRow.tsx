import type { TeamStatPair } from '../types/view'

/** Formatea el valor según el tipo de métrica (entero, decimal tipo xG, %).
 *  Si Fotmob mandó algo más rico ("585 (90%)"), se enseña tal cual: el
 *  porcentaje dice más que el número suelto. */
function formatValue(value: number, pair: TeamStatPair, text?: string): string {
  if (text) return text
  if (pair.isPercent) return `${Math.round(value)}%`
  if (pair.isDecimal) return value.toFixed(2)
  return String(Math.round(value))
}

/** Fila de comparativa local/visitante con barra partida.
 *
 *  Las barras crecían animadas al aparecer, pero eran ~45 métricas × 2 barras
 *  animándose de golpe al abrir estadísticas. Ahora se pintan en su sitio. */
export default function StatCompareRow({ pair }: { pair: TeamStatPair }) {
  const total = pair.home + pair.away || 1
  const homePct = (pair.home / total) * 100
  const wide = !!(pair.homeText || pair.awayText)

  return (
    <div className={'motm-compare-row' + (wide ? ' motm-compare-row--wide' : '')}>
      <span className="motm-compare-row__val">{formatValue(pair.home, pair, pair.homeText)}</span>
      <div className="motm-compare-row__mid">
        <span className="motm-compare-row__label">{pair.label}</span>
        <div className="motm-compare-row__bar motm-compare-row__bar--split">
          <span className="motm-compare-row__bar-fill" style={{ width: `${homePct}%` }} />
          <span
            className="motm-compare-row__bar-fill motm-compare-row__bar-fill--away"
            style={{ width: `${100 - homePct}%` }}
          />
        </div>
      </div>
      <span className="motm-compare-row__val">{formatValue(pair.away, pair, pair.awayText)}</span>
    </div>
  )
}
