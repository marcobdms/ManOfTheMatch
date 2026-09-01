import { useEffect } from 'react'
import { useLocation, useOutlet } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import BottomNav from './components/BottomNav'
import { PANEL_ENTER, PANEL_EXIT } from './lib/motion'
import { isTabRoute } from './lib/routeOrder'

// Dos comportamientos, no dos animaciones:
//
//   - Pestañas del bottom nav: cambio INSTANTÁNEO, sin transición. Con
//     `mode="wait"` la saliente tenía que terminar de desvanecerse antes de
//     montar la entrante, así que cada toque costaba un hueco en blanco de
//     ~220ms aunque los datos ya estuvieran en caché — se sentía a "recarga",
//     no a cambio de pestaña. Un tab bar nativo tampoco anima: cambia y ya.
//   - Vistas de detalle (equipo, stats, alineaciones, auth): sí animan, con
//     un push lateral corto, porque ahí el movimiento SÍ dice algo (entras y
//     sales de un nivel más profundo). Son navegaciones puntuales, no el
//     gesto que repites cada dos segundos.
const pushVariants = {
  enter: { x: 24, opacity: 0 },
  center: { x: 0, opacity: 1, transition: PANEL_ENTER },
  exit: { x: -24, opacity: 0, transition: PANEL_EXIT },
}

const reducedVariants = {
  enter: { opacity: 0 },
  center: { opacity: 1, transition: { duration: 0.08 } },
  exit: { opacity: 0, transition: { duration: 0.08 } },
}

export default function App() {
  const location = useLocation()
  const outlet = useOutlet()
  const reduceMotion = useReducedMotion()

  const isTab = isTabRoute(location.pathname)

  // Sin esto, al entrar a una vista nueva se hereda el scroll de la anterior
  // y la transición parece "saltar" a mitad de camino.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])

  return (
    <div className="motm-shell">
      <main className="motm-shell__main">
        {isTab ? (
          <div className="motm-page">{outlet}</div>
        ) : (
          // `mode="wait"`: la saliente termina ANTES de montar la entrante, así
          // nunca coexisten en el flujo (que era lo que hacía crecer el ancho
          // del documento y disparaba la scrollbar lateral).
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              className="motm-page"
              variants={reduceMotion ? reducedVariants : pushVariants}
              initial="enter"
              animate="center"
              exit="exit"
            >
              {outlet}
            </motion.div>
          </AnimatePresence>
        )}
      </main>
      <BottomNav />
    </div>
  )
}
