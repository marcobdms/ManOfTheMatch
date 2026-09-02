import { NavLink } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import {
  Broadcast,
  CalendarDots,
  House,
  ShieldChevron,
  User,
} from '@phosphor-icons/react'

const items = [
  { to: '/home', label: 'Home', Icon: House, end: false },
  { to: '/proximos', label: 'Próximos', Icon: CalendarDots, end: false },
  { to: '/', label: 'En vivo', Icon: Broadcast, end: true },
  { to: '/equipos', label: 'Equipos', Icon: ShieldChevron, end: false },
  { to: '/perfil', label: 'Perfil', Icon: User, end: false },
]

/** Tab bar de cristal. La pastilla del activo se DESLIZA de pestaña a pestaña
 *  con `layoutId` (una sola pastilla montada, framer interpola su posición).
 *
 *  Esto antes no se podía: la medición del layout caía justo en el frame en
 *  que AnimatePresence montaba/desmontaba la página y la pastilla llegaba
 *  descuadrada. Desde que las pestañas cambian de forma instantánea
 *  (App.tsx) ya no hay tal remonte, y la medición es estable. */
export default function BottomNav() {
  const reduceMotion = useReducedMotion()

  return (
    <nav className="motm-nav">
      {items.map(({ to, label, Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) => 'motm-nav__item' + (isActive ? ' is-active' : '')}
        >
          {({ isActive }) => (
            <>
              {isActive && (
                <motion.span
                  className="motm-nav__pill"
                  layoutId="motm-nav-pill"
                  // Sin rebote: el vidrio de iOS asienta, no salta.
                  transition={
                    reduceMotion
                      ? { duration: 0.001 }
                      : { type: 'spring', stiffness: 420, damping: 38, mass: 0.7 }
                  }
                />
              )}
              <span className="motm-nav__ico">
                <Icon size={23} weight={isActive ? 'fill' : 'regular'} />
              </span>
              {label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
