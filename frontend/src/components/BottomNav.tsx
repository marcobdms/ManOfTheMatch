import { NavLink, useLocation } from 'react-router-dom'
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

/** Qué pestaña corresponde a la ruta actual. Mismo criterio que `NavLink`:
 *  "En vivo" solo con la raíz exacta, el resto también con sus subrutas
 *  (`/equipos/barcelona` mantiene Equipos marcado). -1 = ninguna, que pasa en
 *  vistas de detalle como `/partidos/:id` o `/clasificacion`. */
function activeIndexFor(pathname: string): number {
  return items.findIndex(({ to, end }) =>
    end ? pathname === to : pathname === to || pathname.startsWith(`${to}/`),
  )
}

/**
 * Tab bar de cristal.
 *
 * La pastilla es UN solo elemento fijo dentro de la barra, colocado por índice
 * (`translateX(n * 100%)` sobre un ancho de 1/5). Antes era una pastilla por
 * pestaña compartiendo `layoutId`: framer tenía que medir la posición de la
 * que se desmontaba y la que se montaba en el mismo frame, y al tocar rápido
 * varias secciones esa medición fallaba — la pastilla se quedaba parada o
 * aparecía desde abajo (desde su posición por defecto, sin medida previa).
 *
 * Así no hay medición ninguna: la posición es aritmética y el movimiento es
 * una transición CSS de `transform`, que va por compositor y siempre apunta
 * al destino nuevo aunque llegue a mitad de camino.
 */
export default function BottomNav() {
  const { pathname } = useLocation()
  const activeIndex = activeIndexFor(pathname)

  return (
    <nav className="motm-nav">
      <div className="motm-nav__track">
        <span
          className="motm-nav__pill"
          aria-hidden="true"
          style={{
            transform: `translateX(${Math.max(activeIndex, 0) * 100}%)`,
            // En una vista de detalle no hay pestaña activa: se desvanece en
            // el sitio en vez de irse a una posición que no significa nada.
            opacity: activeIndex === -1 ? 0 : 1,
          }}
        />

        {items.map(({ to, label, Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => 'motm-nav__item' + (isActive ? ' is-active' : '')}
          >
            {({ isActive }) => (
              <>
                <span className="motm-nav__ico">
                  <Icon size={23} weight={isActive ? 'fill' : 'regular'} />
                </span>
                {label}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
