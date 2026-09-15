import { PlayCircle } from '@phosphor-icons/react'
import { relative } from './NewsCard'
import { contentKind, pickHighlights } from '../lib/highlights'
import { useVideoHighlights } from '../lib/queries'
import type { NewsItem } from '../types/view'

const MAX_ITEMS = 10
/** De sobra sobre MAX_ITEMS: pickHighlights necesita margen para poder saltar
 *  vídeos repetidos de un mismo equipo y aun así llegar a 10. */
const POOL_LIMIT = 40

/** Tarjeta suelta del carrusel: miniatura + play, título del vídeo y un
 *  párrafo corto (tipo de vídeo · fuente · cuándo) — los vídeos no pasan por
 *  Groq (ver newsWriter.ts), así que el párrafo se arma con lo que ya
 *  tenemos, no se inventa una crónica del contenido. */
function HighlightCard({ item }: { item: NewsItem }) {
  const kind = contentKind(item.title)
  const paragraph = [kind, item.originalSource, relative(item.publishedAt)].filter(Boolean).join(' · ')

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
          <PlayCircle size={34} weight="fill" />
        </span>
      </div>
      <div className="motm-hl-card__text">
        <h3 className="motm-hl-card__title">{item.title}</h3>
        <p className="motm-hl-card__paragraph">{paragraph}</p>
      </div>
    </a>
  )
}

/** Carrusel de resúmenes/vídeos en Home: resúmenes de partido de LaLiga y
 *  Champions, goles de la jornada, ruedas de prensa, entrevistas — todo lo
 *  que entra por `syncVideoNews` como `topic = 'VIDEO'`. Scroll nativo con
 *  snap, misma técnica que StatCarousel (fino en la PWA de iOS aunque el
 *  hilo principal esté ocupado). */
export default function HighlightsCarousel() {
  const poolQuery = useVideoHighlights(POOL_LIMIT)
  const pool = poolQuery.data ?? []
  const items = pickHighlights(pool, MAX_ITEMS)

  if (poolQuery.isLoading) {
    return <div className="motm-skel" style={{ height: 180 }} aria-hidden="true" />
  }
  if (items.length === 0) return null

  return (
    <section className="motm-hl">
      <h2 className="motm-label motm-hl__label">Resúmenes y vídeos</h2>
      <div className="motm-hl__track">
        {items.map((item) => (
          <HighlightCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  )
}
