import { NavLink } from 'react-router-dom'
import { motion } from 'framer-motion'
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

export default function BottomNav() {
  return (
    <nav className="motm-nav">
      {items.map(({ to, label, Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            'motm-nav__item' + (isActive ? ' is-active' : '')
          }
        >
          {({ isActive }) => (
            <>
              <span className="motm-nav__ico">
                {/* Cada pestaña anima SU propio fondo (escala + opacidad), sin
                    `layoutId` compartido: ese modo mide la posición del
                    resaltado viejo y el nuevo para interpolar, y esa medición
                    caía justo en el frame en que AnimatePresence monta/desmonta
                    la página — con el layout aún moviéndose, salía descuadrado
                    y "llegando tarde". Esto es local, así que es exacto. */}
                <motion.span
                  className="motm-nav__ico-bg"
                  initial={false}
                  animate={{ opacity: isActive ? 1 : 0, scale: isActive ? 1 : 0.7 }}
                  transition={{ duration: 0.16, ease: 'easeOut' }}
                />
                <Icon size={22} weight={isActive ? 'fill' : 'regular'} style={{ position: 'relative' }} />
              </span>
              {label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
