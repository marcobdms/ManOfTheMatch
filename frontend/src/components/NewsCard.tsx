import { Link } from 'react-router-dom'
import TeamCrest from './TeamCrest'
import { teamColor } from '../lib/teamColors'
import { TEAMS, type TeamId } from '../lib/shared'
import type { NewsItem, NewsTopic } from '../types/view'

const TOPIC_LABEL: Record<NewsTopic, string> = {
  ONCE: 'Alineaciones',
  PREVIA: 'Previa',
  CRONICA: 'Crónica',
  LESION: 'Lesiones',
  TECNICO: 'El técnico',
  FICHAJES: 'Fichajes',
}

/** Etiqueta roja de arriba: el club si lo sabemos, si no el tema. */
function eyebrow(item: NewsItem): string {
  const team = item.teamId ? TEAMS[item.teamId as TeamId] : null
  if (team) return team.name.toUpperCase()
  return item.topic ? TOPIC_LABEL[item.topic].toUpperCase() : 'LALIGA'
}

function relative(iso: string | null): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.round(diff / 60000)
  if (mins < 60) return `hace ${Math.max(1, mins)} min`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `hace ${hours} h`
  return `hace ${Math.round(hours / 24)} d`
}

/** Carta con el escudo sobre el color del club — lo que se pinta cuando no hay
 *  foto libre del protagonista. No es un placeholder de emergencia: es el
 *  aspecto normal de buena parte del feed. */
function CrestArt({ item, tall }: { item: NewsItem; tall: boolean }) {
  const team = item.teamId ? TEAMS[item.teamId as TeamId] : null
  return (
    <div
      className={`motm-news__art motm-news__art--crest${tall ? ' motm-news__art--tall' : ''}`}
      style={{ '--news-tint': teamColor(item.teamId) } as React.CSSProperties}
      aria-hidden="true"
    >
      <TeamCrest teamId={item.teamId} tla={team?.tla ?? '—'} size={tall ? 92 : 44} />
    </div>
  )
}

function Art({ item, tall }: { item: NewsItem; tall: boolean }) {
  if (!item.imageUrl) return <CrestArt item={item} tall={tall} />
  return (
    <div className={`motm-news__art${tall ? ' motm-news__art--tall' : ''}`}>
      <img src={item.imageUrl} alt="" loading="lazy" />
    </div>
  )
}

/** Obligatoria con CC BY-SA: autor + licencia + enlace. Solo en la pieza
 *  grande y en el detalle — en la miniatura no cabe y no se muestra imagen
 *  a tamaño suficiente para que aplique. */
export function ImageCredit({ item }: { item: NewsItem }) {
  if (!item.imageUrl || !item.imageLicense) return null
  return (
    <p className="motm-news__credit">
      Foto: {item.imageAuthor ?? 'autor desconocido'} ·{' '}
      {item.imageLicenseUrl ? (
        <a href={item.imageLicenseUrl} target="_blank" rel="noreferrer">
          {item.imageLicense}
        </a>
      ) : (
        item.imageLicense
      )}
      {item.imageSourceUrl && (
        <>
          {' · '}
          <a href={item.imageSourceUrl} target="_blank" rel="noreferrer">
            Wikimedia Commons
          </a>
        </>
      )}
    </p>
  )
}

export default function NewsCard({ item, hero = false }: { item: NewsItem; hero?: boolean }) {
  return (
    <Link to={`/noticias/${item.id}`} className={`motm-news${hero ? ' motm-news--hero' : ''}`}>
      {hero && <Art item={item} tall />}
      <div className="motm-news__text">
        <span className="motm-news__eyebrow">{eyebrow(item)}</span>
        <h3 className="motm-news__title">{item.title}</h3>
        {hero && item.summary && <p className="motm-news__summary">{item.summary}</p>}
        <span className="motm-news__meta">{relative(item.publishedAt)}</span>
      </div>
      {!hero && <Art item={item} tall={false} />}
    </Link>
  )
}
