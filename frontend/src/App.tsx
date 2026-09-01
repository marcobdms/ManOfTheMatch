import { useEffect, useState } from 'react'
import { useLocation, useOutlet } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import BottomNav from './components/BottomNav'
import { PANEL_ENTER, PANEL_EXIT } from './lib/motion'
import { isTabRoute } from './lib/routeOrder'

// Tres comportamientos, según qué tipo de salto sea:
//
//   - Entre pestañas del bottom nav: cambio INSTANTÁNEO, sin transición. Con
//     `mode="wait"` la saliente tenía que terminar de desvanecerse antes de
//     montar la entrante, así que cada toque costaba un hueco en blanco de
//     ~220ms aunque los datos ya estuvieran en caché — se sentía a "recarga",
//     no a cambio de pestaña. Un tab bar nativo tampoco anima: cambia y ya.
//   - Entrando a una vista de detalle (equipo, stats, alineaciones, auth):
//     push desde la derecha, porque bajas un nivel.
//   - Volviendo de una vista de detalle: push desde la IZQUIERDA, el mismo
//     movimiento al revés. Sin esto, volver a una pestaña con la flecha era
//     un corte seco mientras que volver a otra vista de detalle sí animaba,
//     que era justo la inconsistencia que se notaba.
const pushVariants = {
  enter: { x: 24, opacity: 0 },
  center: { x: 0, opacity: 1, transition: PANEL_ENTER },
  exit: { x: -24, opacity: 0, transition: PANEL_EXIT },
}

const backVariants = {
  enter: { x: -24, opacity: 0 },
  center: { x: 0, opacity: 1, transition: PANEL_ENTER },
  exit: { x: 24, opacity: 0, transition: PANEL_EXIT },
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

  // Venir de una vista de detalle a una pestaña es "volver": el mismo push
  // pero en sentido contrario. Se calcula ajustando estado durante el render
  // (patrón de React para "derivar de la prop anterior") en vez de con un
  // ref, que no se puede leer aquí — y con un efecto llegaría un frame tarde,
  // justo después de que la animación ya hubiera arrancado.
  const [prevPath, setPrevPath] = useState(location.pathname)
  const [cameFromDetail, setCameFromDetail] = useState(false)
  if (prevPath !== location.pathname) {
    setCameFromDetail(!isTabRoute(prevPath))
    setPrevPath(location.pathname)
  }

  // Sin esto, al entrar a una vista nueva se hereda el scroll de la anterior
  // y la transición parece "saltar" a mitad de camino.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])

  const animated = !isTab || cameFromDetail
  const variants = reduceMotion ? reducedVariants : cameFromDetail ? backVariants : pushVariants

  return (
    <div className="motm-shell">
      <main className="motm-shell__main">
        {animated ? (
          // `mode="wait"`: la saliente termina ANTES de montar la entrante, así
          // nunca coexisten en el flujo (que era lo que hacía crecer el ancho
          // del documento y disparaba la scrollbar lateral).
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              className="motm-page"
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
            >
              {outlet}
            </motion.div>
          </AnimatePresence>
        ) : (
          <div className="motm-page">{outlet}</div>
        )}
      </main>
      <BottomNav />
    </div>
  )
}
