import { ArrowLeft, YoutubeLogo } from '@phosphor-icons/react'
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
 * Resumen en vídeo de un partido ya jugado.
 *
 * NO se embebe el reproductor: LaLiga tiene desactivada la reproducción fuera
 * de YouTube para sus vídeos ("este vídeo incluye contenido de LaLiga, que lo
 * ha bloqueado para que no se muestre en este sitio web o aplicación"), y eso
 * es una decisión del dueño de los derechos, no algo que se pueda rodear. Lo
 * que sí funciona siempre: la miniatura oficial + un toque que abre el vídeo
 * en YouTube, donde el canal se lleva su visualización.
 *
 * Tampoco se puede detectar desde el navegador si un vídeo concreto permite
 * embed (el iframe es cross-origin y no avisa cuando lo bloquean), así que ni
 * se intenta — mejor una miniatura que siempre carga que un reproductor que a
 * veces sale con un error dentro.
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
            <a className="motm-video" href={url} target="_blank" rel="noreferrer" aria-label="Ver el resumen en YouTube">
              {thumbnail && (
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
              )}
              <span className="motm-video__play" aria-hidden="true">
                <YoutubeLogo size={30} weight="fill" />
              </span>
            </a>

            <p className="motm-note" style={{ marginTop: 10 }}>
              LaLiga solo permite ver sus resúmenes dentro de YouTube, así que el vídeo se abre allí.
            </p>
          </>
        )}
      </div>
    </>
  )
}
