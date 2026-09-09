import { PlayCircle } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import TeamCrest from './TeamCrest'
import laligaLogo from '../assets/crests/laliga.svg'
import { teamColor } from '../lib/teamColors'
import { TEAMS, type TeamId } from '../lib/shared'
import type { NewsItem, NewsTopic } from '../types/view'

/** Rojo de LaLiga para el fondo de las noticias de competición (sin club). */
const LALIGA_TINT = '#D6001C'

const TOPIC_LABEL: Record<NewsTopic, string> = {
  ONCE: 'Alineaciones',
  PREVIA: 'Previa',
  CRONICA: 'Crónica',
  LESION: 'Lesiones',
  TECNICO: 'El técnico',
  FICHAJES: 'Fichajes',
  VIDEO: 'Vídeo',
}

/** Nombre de equipo compacto para el antetítulo de una previa: sin la coletilla
 *  societaria ("FC Barcelona" -> "Barcelona", "Real Betis Balompié" -> "Real
 *  Betis", "Lille OSC" -> "Lille"). */
function shortTeam(name: string | null): string {
  if (!name) return ''
  return name
    .replace(/^(FC|RC|CA|AC|AS|SSC|VfB|RCD|SC|CD|UD|SD)\s+/i, '')
    .replace(/\s+(FC|CF|CD|UD|SD|SC|KV|SK|OSC|AC|BK|FK)$/i, '')
    .replace(/\s+(Balompié|Rotterdam|Linz|Milano|Bratislava|Athens|Atenas)$/i, '')
    .trim()
}

/** Etiqueta roja de arriba: en una previa, los dos equipos; si no, el club, y
 *  si tampoco, el tema. */
export function newsEyebrow(item: NewsItem): string {
  if (item.match) {
    const h = shortTeam(item.match.homeName)
    const a = shortTeam(item.match.awayName)
    if (h && a) return `${h} – ${a}`.toUpperCase()
  }
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
 *  aspecto normal de buena parte del feed. Una noticia SIN club (Tebas, el
 *  VAR, la competición en general) lleva el logo de LaLiga sobre su rojo, en
 *  vez del círculo gris con un guion que salía antes. */
function CrestArt({ item, tall }: { item: NewsItem; tall: boolean }) {
  const team = item.teamId ? TEAMS[item.teamId as TeamId] : null
  if (!item.teamId) {
    return (
      <div
        className={`motm-news__art motm-news__art--crest${tall ? ' motm-news__art--tall' : ''}`}
        style={{ '--news-tint': LALIGA_TINT } as React.CSSProperties}
        aria-hidden="true"
      >
        <img className="motm-news__league" src={laligaLogo} alt="" style={{ height: tall ? 64 : 30 }} />
      </div>
    )
  }
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

/** Previa de partido: los dos escudos, cada mitad tintada con el color del
 *  club. Manda sobre cualquier foto — es el diseño propio de la previa. */
function DuoCrestArt({ item, tall }: { item: NewsItem; tall: boolean }) {
  const m = item.match!
  const half = (id: string | null, name: string | null, side: 'l' | 'r') => (
    <div
      className={`motm-news__duo-half motm-news__duo-half--${side}`}
      style={{ '--news-tint': teamColor(id) } as React.CSSProperties}
    >
      <TeamCrest teamId={id ?? undefined} name={name} tla={shortTeam(name).slice(0, 3) || '—'} size={tall ? 76 : 34} />
    </div>
  )
  return (
    <div
      className={`motm-news__art motm-news__art--duo${tall ? ' motm-news__art--tall' : ''}`}
      aria-hidden="true"
    >
      {half(m.homeId, m.homeName, 'l')}
      {half(m.awayId, m.awayName, 'r')}
    </div>
  )
}

export function NewsArt({ item, tall }: { item: NewsItem; tall: boolean }) {
  // Un vídeo se enseña con su miniatura y el play encima — se abre fuera.
  if (item.videoUrl && item.imageUrl) {
    return (
      <div className={`motm-news__art motm-news__art--video${tall ? ' motm-news__art--tall' : ''}`}>
        <img src={item.imageUrl} alt="" loading="lazy" />
        <span className="motm-news__play" aria-hidden="true">
          <PlayCircle size={tall ? 46 : 26} weight="fill" />
        </span>
      </div>
    )
  }
  if (item.match) return <DuoCrestArt item={item} tall={tall} />
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
      {hero && <NewsArt item={item} tall />}
      <div className="motm-news__text">
        <span className="motm-news__eyebrow">{newsEyebrow(item)}</span>
        <h3 className="motm-news__title">{item.title}</h3>
        {hero && item.summary && <p className="motm-news__summary">{item.summary}</p>}
        <span className="motm-news__meta">{relative(item.publishedAt)}</span>
      </div>
      {!hero && <NewsArt item={item} tall={false} />}
    </Link>
  )
}
