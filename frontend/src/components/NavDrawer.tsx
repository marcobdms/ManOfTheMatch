import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  Broadcast,
  CalendarDots,
  House,
  ShieldChevron,
  SignOut,
  User,
  X,
} from '@phosphor-icons/react'
import { useAuth } from '../lib/AuthProvider'
import { signOut } from '../lib/auth'

const LINKS = [
  { to: '/', label: 'En vivo', Icon: Broadcast },
  { to: '/home', label: 'Home', Icon: House },
  { to: '/proximos', label: 'Próximos', Icon: CalendarDots },
  { to: '/equipos', label: 'Equipos', Icon: ShieldChevron },
]

// Mismo par de curvas que App.tsx (salida más rápida que entrada) — el panel
// es otra transición de navegación, no una nueva familia de movimiento.
const ENTER = { duration: 0.22, ease: [0.16, 1, 0.3, 1] as const }
const EXIT = { duration: 0.14, ease: 'easeIn' as const }

type Props = {
  open: boolean
  onClose: () => void
}

/** Panel lateral del botón hamburguesa: navegación completa + sesión. No
 *  duplica el bottom nav como única entrada — añade accesos que hoy no
 *  existen en ningún sitio (cerrar sesión fuera de Perfil, info de la app). */
export default function NavDrawer({ open, onClose }: Props) {
  const { session, profile } = useAuth()
  const navigate = useNavigate()
  const reduceMotion = useReducedMotion()

  // Cerrar con Escape — el panel es modal mientras está abierto.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Bloquea el scroll del fondo mientras el panel está abierto.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  function go(to: string) {
    onClose()
    navigate(to)
  }

  async function handleSignOut() {
    onClose()
    await signOut()
    navigate('/')
  }

  const panelTransition = reduceMotion ? { duration: 0.08 } : undefined

  // Portal a `document.body`: AppHeader (y por tanto este panel) vive dentro
  // de cada página, que App.tsx envuelve en un `motion.div` animado — un
  // ancestro con `transform` activo (incluso en reposo, Framer Motion deja
  // `transform: translateX(0px)` puesto) rompe `position: fixed` y le quita
  // al navegador la vía rápida de composición por GPU. Sacarlo del árbol de
  // la página evita ese ancestro por completo.
  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="motm-drawer__veil"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: panelTransition ?? ENTER }}
            exit={{ opacity: 0, transition: panelTransition ?? EXIT }}
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            className="motm-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Menú de navegación"
            initial={{ x: '-100%' }}
            animate={{ x: 0, transition: panelTransition ?? ENTER }}
            exit={{ x: '-100%', transition: panelTransition ?? EXIT }}
          >
            <div className="motm-drawer__head">
              <span className="motm-wordmark">ManOfTheMatch</span>
              <button type="button" className="motm-iconbtn" aria-label="Cerrar menú" onClick={onClose}>
                <X size={22} />
              </button>
            </div>

            <nav className="motm-drawer__nav">
              {LINKS.map(({ to, label, Icon }) => (
                <button key={to} type="button" className="motm-drawer__link" onClick={() => go(to)}>
                  <Icon size={20} />
                  {label}
                </button>
              ))}
            </nav>

            <div className="motm-drawer__divider" />

            {session ? (
              <button type="button" className="motm-drawer__link" onClick={() => go('/perfil')}>
                <User size={20} />
                {profile?.display_name || 'Mi perfil'}
              </button>
            ) : (
              <div className="motm-drawer__auth">
                <p className="motm-note">Entra para elegir tu equipo favorito y recibir avisos.</p>
                <div className="motm-drawer__auth-btns">
                  <Link className="motm-btn motm-drawer__auth-btn" to="/entrar" onClick={onClose}>
                    Entrar
                  </Link>
                  <Link className="motm-btn motm-btn--muted motm-drawer__auth-btn" to="/registro" onClick={onClose}>
                    Crear cuenta
                  </Link>
                </div>
              </div>
            )}

            {session && (
              <button type="button" className="motm-drawer__link motm-drawer__link--danger" onClick={() => void handleSignOut()}>
                <SignOut size={20} />
                Cerrar sesión
              </button>
            )}

            <div className="motm-drawer__footer">
              <span className="motm-note">ManOfTheMatch · LaLiga</span>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  )
}
