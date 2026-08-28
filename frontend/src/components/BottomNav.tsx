import { NavLink } from 'react-router-dom'
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
                <Icon size={22} weight={isActive ? 'fill' : 'regular'} />
              </span>
              {label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
