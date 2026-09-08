import { useParams } from 'react-router-dom'
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
          </article>
        )}
      </div>
    </>
  )
}
