import type { TeamStatPair } from '../types/view'

/** Formatea el valor según el tipo de métrica (entero, decimal tipo xG, %). */
function formatValue(value: number, pair: TeamStatPair): string {
  if (pair.isPercent) return `${Math.round(value)}%`
  if (pair.isDecimal) return value.toFixed(2)
  return String(Math.round(value))
}

/** Fila de comparativa local/visitante con barra — usada por la vista de
 *  estadísticas de partido. Soporta enteros, decimales (xG) y porcentajes. */
export default function StatCompareRow({ pair }: { pair: TeamStatPair }) {
  const total = pair.home + pair.away || 1
  const homePct = (pair.home / total) * 100

  return (
    <div className="motm-compare-row">
      <span className="motm-compare-row__val">{formatValue(pair.home, pair)}</span>
      <div className="motm-compare-row__mid">
        <span className="motm-compare-row__label">{pair.label}</span>
        <div className="motm-compare-row__bar motm-compare-row__bar--split">
          <span className="motm-compare-row__bar-fill" style={{ width: `${homePct}%` }} />
          <span className="motm-compare-row__bar-fill motm-compare-row__bar-fill--away" style={{ width: `${100 - homePct}%` }} />
        </div>
      </div>
      <span className="motm-compare-row__val">{formatValue(pair.away, pair)}</span>
    </div>
  )
}
