import { ArrowLeft, YoutubeLogo } from '@phosphor-icons/react'
import { useNavigate, useParams } from 'react-router-dom'
import AppHeader from '../components/AppHeader'
import { useFixtureById } from '../lib/queries'

/** Saca el id de vídeo de un enlace de YouTube (watch?v=, youtu.be/, /embed/).
 *  Si no se reconoce, devuelve null y la vista cae al enlace externo — nunca
 *  se construye un embed a ciegas. */
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

/** Resumen en vídeo de un partido ya jugado. El vídeo NO se rehospeda: se
 *  embebe con el reproductor oficial de YouTube (nocookie), que acredita al
 *  canal que lo subió y le cuenta las visualizaciones. Si el propietario tiene
 *  el embed desactivado, el enlace de abajo lleva a YouTube. */
export default function MatchHighlights() {
  const { fixtureId } = useParams<{ fixtureId: string }>()
  const navigate = useNavigate()
  const matchQuery = useFixtureById(fixtureId)

  const match = matchQuery.data
  const videoId = youtubeId(match?.highlightUrl ?? null)

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
          <div className="motm-skel" style={{ height: 220, margin: '0 16px' }} aria-hidden="true" />
        )}

        {!matchQuery.isLoading && !match?.highlightUrl && (
          <div className="motm-empty">
            <b>Sin resumen todavía</b>
            El vídeo se publica un rato después del partido. Vuelve más tarde.
          </div>
        )}

        {/* Hay enlace pero no es un YouTube que sepamos embeber: al menos que
            se pueda abrir fuera, en vez de decir que no hay resumen. */}
        {!videoId && match?.highlightUrl && (
          <div className="motm-actions">
            <a
              className="motm-btn"
              style={{ flex: 1 }}
              href={match.highlightUrl}
              target="_blank"
              rel="noreferrer"
            >
              <YoutubeLogo size={18} weight="fill" />
              Ver el resumen
            </a>
          </div>
        )}

        {videoId && (
          <>
            <div className="motm-video">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${videoId}`}
                title="Resumen del partido"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            </div>
            <div className="motm-actions" style={{ marginTop: 14 }}>
              <a
                className="motm-btn motm-btn--muted"
                style={{ flex: 1 }}
                href={match?.highlightUrl ?? undefined}
                target="_blank"
                rel="noreferrer"
              >
                <YoutubeLogo size={18} weight="fill" />
                Ver en YouTube
              </a>
            </div>
          </>
        )}
      </div>
    </>
  )
}
