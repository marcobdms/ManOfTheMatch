import { useParams } from 'react-router-dom'
import AppHeader from '../components/AppHeader'
import BackButton from '../components/BackButton'
import TeamCrest from '../components/TeamCrest'
import { ImageCredit } from '../components/NewsCard'
import { useNewsItem } from '../lib/queries'
import { teamColor } from '../lib/teamColors'
import { TEAMS, type TeamId } from '../lib/shared'

export default function NewsDetail() {
  const { newsId } = useParams()
  const { data: item, isLoading } = useNewsItem(newsId)
  const team = item?.teamId ? TEAMS[item.teamId as TeamId] : null

  return (
    <>
      <AppHeader />
      <div className="motm-newsdetail">
        <BackButton />

        {isLoading && <div className="motm-skel" style={{ height: 300 }} aria-hidden="true" />}

        {!isLoading && !item && <p className="motm-note">Esta noticia ya no está disponible.</p>}

        {item && (
          <article>
            {item.imageUrl ? (
              <div className="motm-news__art motm-news__art--tall">
                <img src={item.imageUrl} alt="" />
              </div>
            ) : (
              <div
                className="motm-news__art motm-news__art--crest motm-news__art--tall"
                style={{ '--news-tint': teamColor(item.teamId) } as React.CSSProperties}
                aria-hidden="true"
              >
                <TeamCrest teamId={item.teamId} tla={team?.tla ?? '—'} size={104} />
              </div>
            )}
            <ImageCredit item={item} />

            {team && <span className="motm-news__eyebrow">{team.name.toUpperCase()}</span>}
            <h1 className="motm-newsdetail__title">{item.title}</h1>
            {item.body && <p className="motm-newsdetail__body">{item.body}</p>}
          </article>
        )}
      </div>
    </>
  )
}
