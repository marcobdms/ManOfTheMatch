import { useRef, useState } from 'react'
import StatCompareRow from './StatCompareRow'
import type { TeamStatGroup } from '../types/view'

/**
 * Los bloques de la comparativa (Resumen, Goles esperados, Tiros…) como
 * tarjetas que se pasan deslizando en horizontal.
 *
 * El desplazamiento es scroll nativo con `scroll-snap`, no una animación en
 * JS: en la PWA de iOS el scroll nativo lo mueve el compositor del sistema y
 * va fino aunque el hilo principal esté ocupado, que es justo donde las
 * animaciones por JS se notan a tirones.
 */
export default function StatCarousel({ groups }: { groups: TeamStatGroup[] }) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)

  function onScroll() {
    const el = trackRef.current
    if (!el) return
    // Una tarjeta ocupa el ancho visible: el índice es cuántos anchos llevamos.
    const index = Math.round(el.scrollLeft / el.clientWidth)
    if (index !== active) setActive(Math.max(0, Math.min(index, groups.length - 1)))
  }

  function goTo(index: number) {
    const el = trackRef.current
    if (!el) return
    el.scrollTo({ left: index * el.clientWidth, behavior: 'smooth' })
  }

  if (groups.length === 0) return null

  return (
    <div className="motm-carousel">
      <div className="motm-carousel__track" ref={trackRef} onScroll={onScroll}>
        {groups.map((group) => (
          <section className="motm-carousel__card" key={group.key} aria-label={group.label}>
            <h3 className="motm-carousel__title">{group.label}</h3>
            <div className="motm-compare__rows">
              {group.stats.map((pair) => (
                <StatCompareRow key={pair.key} pair={pair} />
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="motm-carousel__dots" role="tablist" aria-label="Bloques de estadísticas">
        {groups.map((group, i) => (
          <button
            key={group.key}
            type="button"
            role="tab"
            aria-selected={i === active}
            aria-label={group.label}
            className={'motm-carousel__dot' + (i === active ? ' is-active' : '')}
            onClick={() => goTo(i)}
          />
        ))}
      </div>

      <p className="motm-carousel__hint">{groups[active]?.label}</p>
    </div>
  )
}
