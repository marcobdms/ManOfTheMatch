import { ArrowLeft, PlayCircle } from '@phosphor-icons/react'
import { useNavigate, useParams } from 'react-router-dom'
import AppHeader from '../components/AppHeader'
import { useFixtureById } from '../lib/queries'

/** Saca el id de vídeo de un enlace de YouTube (watch?v=, youtu.be/, /embed/).
 *  Solo se usa para derivar la miniatura si Fotmob no la mandó. */
function youtubeId(url: string | null): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '')
    if (host === 'youtu.be') return u.pathname.slice(1) || null
    if (host.endsWith('youtube.com')) {
      const v = u.searchParams.get('v')
      if (v) return v
      const match = u.pathname.match(/\/(embed|shorts|v)\/([^/?]+)/)
      if (match) return match[2]
    }
  } catch {
    return null
  }
  return null
}

/**
 * Resumen en vídeo de un partido ya jugado: miniatura oficial de vista previa
 * + botón que lo abre en YouTube.
 *
 * NO se embebe el reproductor: LaLiga tiene desactivada la reproducción fuera
 * de YouTube para sus vídeos ("este vídeo incluye contenido de LaLiga, que lo
 * ha bloqueado para que no se muestre en este sitio web o aplicación"), y eso
 * es del dueño de los derechos, no algo que se pueda rodear. Tampoco se puede
 * detectar desde el navegador si un vídeo concreto permite embed (el iframe es
 * cross-origin y no avisa cuando lo bloquean), así que ni se intenta.
 */
export default function MatchHighlights() {
  const { fixtureId } = useParams<{ fixtureId: string }>()
  const navigate = useNavigate()
  const matchQuery = useFixtureById(fixtureId)

  const match = matchQuery.data
  const url = match?.highlightUrl ?? null
  const videoId = youtubeId(url)
  const thumbnail =
    match?.highlightThumbnail ?? (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null)

  return (
    <>
      <AppHeader />
      <div className="motm-lineup">
        <div className="motm-lineup__head">
          <button type="button" className="motm-iconbtn motm-lineup__back" aria-label="Volver" onClick={() => navigate(-1)}>
            <ArrowLeft size={22} />
          </button>
          <div className="motm-lineup__identity">
            <h1 className="motm-lineup__name">Highlights</h1>
            {match && (
              <p className="motm-lineup__meta">
                {match.home.shortName} {match.homeScore}–{match.awayScore} {match.away.shortName}
              </p>
            )}
          </div>
        </div>

        {matchQuery.isLoading && (
          <div className="motm-skel" style={{ height: 200, margin: '0 16px' }} aria-hidden="true" />
        )}

        {!matchQuery.isLoading && !url && (
          <div className="motm-empty">
            <b>Aún no se ha subido el resumen</b>
            Suele publicarse unas horas después del partido. Vuelve más tarde.
          </div>
        )}

        {url && (
          <>
            {/* Solo vista previa: quien quiera verlo usa el botón de abajo,
                así no hay dos formas de hacer lo mismo. */}
            {thumbnail && (
              <div className="motm-video">
                <img
                  src={thumbnail}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  // maxresdefault no existe para todos los vídeos — si falla,
                  // hqdefault sí está siempre.
                  onError={(e) => {
                    if (!videoId) return
                    const img = e.currentTarget
                    const fallback = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
                    if (img.src !== fallback) img.src = fallback
                  }}
                />
              </div>
            )}

            <div className="motm-actions" style={{ marginTop: 14 }}>
              <a className="motm-btn" style={{ flex: 1 }} href={url} target="_blank" rel="noreferrer">
                <PlayCircle size={18} weight="fill" />
                Ver en YouTube
              </a>
            </div>
          </>
        )}
      </div>
    </>
  )
}
