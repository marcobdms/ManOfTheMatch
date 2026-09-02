import { useEffect } from 'react'
import { useLocation, useOutlet } from 'react-router-dom'
import BottomNav from './components/BottomNav'

/**
 * Shell de la app. Ya NO hay transición de página de ningún tipo.
 *
 * Antes las pestañas cambiaban al instante pero las vistas de detalle entraban
 * con un push lateral. Ese push anima toda la página (transform + opacity
 * sobre un árbol que puede llevar 11 cartas de jugador, tablas o el histórico
 * entero), así que el coste se pagaba justo en el frame en que el usuario
 * acababa de tocar — y tocando rápido varias secciones seguidas, el trabajo se
 * acumulaba y la vista se quedaba sin pintar. El cambio de sección es ahora
 * inmediato en todos los casos; el único movimiento que queda en la navegación
 * es la pastilla del tab bar, que es un `transform` sobre un solo elemento.
 */
export default function App() {
  const location = useLocation()
  const outlet = useOutlet()

  // Sin esto, al entrar a una vista nueva se hereda el scroll de la anterior.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])

  return (
    <div className="motm-shell">
      <main className="motm-shell__main">
        <div className="motm-page">{outlet}</div>
      </main>
      <BottomNav />
    </div>
  )
}
