import { useEffect, useRef, useState } from 'react'
import { ClockCounterClockwise, DotsThree, UsersThree } from '@phosphor-icons/react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Link, useParams } from 'react-router-dom'
import AnimatedBell from '../components/AnimatedBell'
import AppHeader from '../components/AppHeader'
import BackButton from '../components/BackButton'
import TeamCrest from '../components/TeamCrest'
import TeamLineupBody from '../components/TeamLineupBody'
import { PANEL_ENTER } from '../lib/motion'
import { useTeam, useTeamLineup } from '../lib/queries'
import { useAuth } from '../lib/AuthProvider'
import { enablePush, disablePush, getPushStatus } from '../lib/push'

/** Ficha de equipo: cancha con el once + banquillo. Fuente de datos:
 *  `team_lineup_snapshots` (Fotmob, plan §A1/§A3-A4). Una lectura, sin joins.
 *  Las acciones (alineación / historial / avisos) viven en el menú "⋯" de la
 *  cabecera en vez de en botones sueltos: eran tres bloques apilados que se
 *  comían media pantalla antes de llegar a la cancha. */
export default function TeamLineup() {
  const { teamId } = useParams<{ teamId: string }>()
  const teamQuery = useTeam(teamId)
  const lineupQuery = useTeamLineup(teamId)
  const { session, profile, updateProfile } = useAuth()
  const [bellBusy, setBellBusy] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const reduceMotion = useReducedMotion()

  const team = teamQuery.data
  const snapshot = lineupQuery.data
  const loading = teamQuery.isLoading || lineupQuery.isLoading

  // El sistema de avisos es "un dispositivo, un equipo favorito" (perfil).
  // La campana aquí marca ESTE equipo como favorito y activa el push.
  const isFavorite = !!teamId && profile?.favorite_team_id === teamId

  // Cerrar al tocar fuera o con Escape — sin esto el menú se queda abierto
  // tapando la cancha y hay que volver a darle al mismo botón.
  useEffect(() => {
    if (!menuOpen) return
    function onPointerDown(e: MouseEvent | TouchEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('touchstart', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('touchstart', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  async function toggleTeamBell() {
    if (bellBusy || !teamId) return
    setBellBusy(true)
    try {
      if (isFavorite) {
        await disablePush()
        await updateProfile({ favorite_team_id: null })
      } else {
        await updateProfile({ favorite_team_id: teamId })
        await enablePush(session?.user.id ?? null, teamId, profile?.prefs ?? {
          matchday: true,
          kickoff: true,
          lineup: true,
          goals: true,
        })
      }
    } catch {
      // getPushStatus no se usa para pintar aquí (isFavorite ya viene del
      // perfil) — un fallo solo deja el estado como estaba, sin romper la UI.
      await getPushStatus()
    } finally {
      setBellBusy(false)
    }
  }

  return (
    <>
      <AppHeader />
      <div className="motm-lineup">
        <div className="motm-lineup__head">
          <BackButton />
          <TeamCrest
            teamId={teamId}
            tla={team?.tla ?? '—'}
            color={team?.primary_color}
            size={44}
            className="motm-lineup__crest"
          />
          <div className="motm-lineup__identity">
            <h1 className="motm-lineup__name">{team?.short_name ?? team?.name ?? (loading ? '' : 'Equipo')}</h1>
            {snapshot?.formation && (
              <p className="motm-lineup__meta">
                {snapshot.formation}
                {snapshot.coach ? ` · ${snapshot.coach}` : ''}
              </p>
            )}
          </div>

          <div className="motm-menu" ref={menuRef}>
            <button
              type="button"
              className="motm-btn motm-btn--icon motm-lineup__more"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="Más opciones"
              onClick={() => setMenuOpen((v) => !v)}
            >
              <DotsThree size={22} weight="bold" />
            </button>

            <AnimatePresence>
              {menuOpen && (
                <motion.div
                  className="motm-menu__pop"
                  role="menu"
                  initial={{ opacity: 0, scale: 0.94, y: -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96, y: -4 }}
                  transition={reduceMotion ? { duration: 0.001 } : PANEL_ENTER}
                  style={{ transformOrigin: 'top right' }}
                >
                  <button
                    type="button"
                    role="menuitem"
                    className="motm-menu__item is-current"
                    aria-current="true"
                    onClick={() => setMenuOpen(false)}
                  >
                    <UsersThree size={17} />
                    Alineación
                  </button>

                  <Link
                    role="menuitem"
                    className="motm-menu__item"
                    to={`/historial/${teamId}`}
                    onClick={() => setMenuOpen(false)}
                  >
                    <ClockCounterClockwise size={17} />
                    Historial
                  </Link>

                  {session ? (
                    <button
                      type="button"
                      role="menuitem"
                      className="motm-menu__item"
                      aria-pressed={isFavorite}
                      aria-busy={bellBusy}
                      disabled={bellBusy}
                      onClick={() => {
                        void toggleTeamBell()
                        setMenuOpen(false)
                      }}
                    >
                      <AnimatedBell active={isFavorite} size={17} />
                      Notificaciones
                      <span className="motm-menu__state">{isFavorite ? 'Sí' : 'No'}</span>
                    </button>
                  ) : (
                    <Link
                      role="menuitem"
                      className="motm-menu__item"
                      to="/entrar"
                      onClick={() => setMenuOpen(false)}
                    >
                      <AnimatedBell active={false} size={17} />
                      Notificaciones
                      <span className="motm-menu__state">Entrar</span>
                    </Link>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <TeamLineupBody snapshot={snapshot} loading={loading} isError={lineupQuery.isError} />
      </div>
    </>
  )
}
