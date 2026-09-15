import { ChartBar, YoutubeLogo } from '@phosphor-icons/react'
import { Link, useParams } from 'react-router-dom'
import AppHeader from '../components/AppHeader'
import BackButton from '../components/BackButton'
import { ImageCredit, NewsArt, newsEyebrow } from '../components/NewsCard'
import { useNewsItem } from '../lib/queries'

export default function NewsDetail() {
  const { newsId } = useParams()
  const { data: item, isLoading } = useNewsItem(newsId)

  return (
    <>
      <AppHeader />
      <div className="motm-newsdetail">
        <BackButton />

        {isLoading && <div className="motm-skel" style={{ height: 300 }} aria-hidden="true" />}

        {!isLoading && !item && <p className="motm-note">Esta noticia ya no está disponible.</p>}

        {item && (
          <article>
            <NewsArt item={item} tall />
            <ImageCredit item={item} />

            <span className="motm-news__eyebrow">{newsEyebrow(item)}</span>
            <h1 className="motm-newsdetail__title">{item.title}</h1>
            {item.body && <p className="motm-newsdetail__body">{item.body}</p>}

            {/* Mismos botones que en el detalle de un partido (MatchDetail) —
                reciclados, no unos nuevos, para que se vea igual en toda la
                app. "Ver estadísticas" solo si el vídeo se pudo casar con un
                partido concreto (por equipo + marcador en el título, ver
                syncVideoNews.ts) — un vídeo suelto (rueda de prensa,
                entrevista) no tiene partido al que enlazar. El vídeo no se
                rehospeda ni se embebe: se abre en su plataforma. */}
            {item.videoUrl && (
              <div className="motm-actions" style={{ marginTop: 14 }}>
                {item.fixtureId && (
                  <Link className="motm-btn" style={{ flex: 1 }} to={`/partidos/${item.fixtureId}/estadisticas`}>
                    <ChartBar size={16} />
                    Ver estadísticas
                  </Link>
                )}
                <a
                  className="motm-btn"
                  style={{ flex: 1 }}
                  href={item.videoUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <YoutubeLogo size={18} weight="fill" />
                  Ver highlights
                </a>
              </div>
            )}
          </article>
        )}
      </div>
    </>
  )
}
