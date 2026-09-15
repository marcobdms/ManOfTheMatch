import { useRef, useState } from 'react'
import { PlayCircle } from '@phosphor-icons/react'
import { relative } from './NewsCard'
import { contentKind, pickHighlights } from '../lib/highlights'
import { useVideoHighlights } from '../lib/queries'
import type { NewsItem } from '../types/view'

const MAX_ITEMS = 15
/** De sobra sobre MAX_ITEMS: pickHighlights necesita margen para evitar
 *  equipos repetidos (y ruedas de prensa repetidas de un mismo equipo) y aun
 *  así llegar al máximo. */
const POOL_LIMIT = 80

/** Card a todo el ancho — la misma card "hero" que antes llevaba la primera
 *  noticia de la lista: el carrusel ocupa ese hueco, y el resto de noticias
 *  se quedan en su formato pequeño de siempre. */
function HighlightCard({ item }: { item: NewsItem }) {
  const paragraph = [item.originalSource, relative(item.publishedAt)].filter(Boolean).join(' · ')

  return (
    <a
      href={item.videoUrl ?? item.originalUrl ?? '#'}
      target="_blank"
      rel="noreferrer"
      className="motm-hl-card"
    >
      <div className="motm-hl-card__art">
        {item.imageUrl && <img src={item.imageUrl} alt="" loading="lazy" />}
        <span className="motm-hl-card__play" aria-hidden="true">
          <PlayCircle size={46} weight="fill" />
        </span>
      </div>
      <div className="motm-hl-card__text">
        <span className="motm-hl-card__eyebrow">{contentKind(item.title).toUpperCase()}</span>
        <h3 className="motm-hl-card__title">{item.title}</h3>
        <p className="motm-hl-card__paragraph">{paragraph}</p>
      </div>
    </a>
  )
}

/** Carrusel de resúmenes/vídeos en Home: resúmenes de partido de LaLiga y
 *  Champions, goles de la jornada, ruedas de prensa, entrevistas — todo lo
 *  que entra por `syncVideoNews` como `topic = 'VIDEO'`. Ocupa el hueco de la
 *  card "hero" de Noticias — antes era la primera noticia a toda anchura,
 *  ahora es esto. Scroll nativo con snap, misma técnica que StatCarousel
 *  (fino en la PWA de iOS aunque el hilo principal esté ocupado). */
export default function HighlightsCarousel() {
  const trackRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)
  const poolQuery = useVideoHighlights(POOL_LIMIT)
  const pool = poolQuery.data ?? []
  const items = pickHighlights(pool, MAX_ITEMS)

  function onScroll() {
    const el = trackRef.current
    if (!el) return
    const index = Math.round(el.scrollLeft / el.clientWidth)
    if (index !== active) setActive(Math.max(0, Math.min(index, items.length - 1)))
  }

  function goTo(index: number) {
    const el = trackRef.current
    if (!el) return
    el.scrollTo({ left: index * el.clientWidth, behavior: 'smooth' })
  }

  if (poolQuery.isLoading) {
    return <div className="motm-skel" style={{ height: 280 }} aria-hidden="true" />
  }
  if (items.length === 0) return null

  return (
    <div className="motm-hl">
      <div className="motm-hl__track" ref={trackRef} onScroll={onScroll}>
        {items.map((item) => (
          <HighlightCard key={item.id} item={item} />
        ))}
      </div>
      {/* Mismos puntitos que StatCarousel (.motm-carousel__dot), no unos
          nuevos — ya son rojos vía --brand en su estado activo. */}
      {items.length > 1 && (
        <div className="motm-carousel__dots" role="tablist" aria-label="Vídeos del carrusel">
          {items.map((item, i) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={i === active}
              aria-label={item.title}
              className={'motm-carousel__dot' + (i === active ? ' is-active' : '')}
              onClick={() => goTo(i)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
