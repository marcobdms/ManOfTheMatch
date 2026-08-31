import { useEffect } from 'react'
import { useLocation, useOutlet } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import BottomNav from './components/BottomNav'
import PullToRefresh from './components/PullToRefresh'
import { PANEL_ENTER, PANEL_EXIT, TAB_ENTER, TAB_EXIT } from './lib/motion'
import { isTabRoute } from './lib/routeOrder'

// Dos familias de transición:
//   - fade: entre las 5 pestañas del bottom nav — cross-fade simple, sin
//     desplazamiento lateral (el swipe entre secciones se sentía a "carrusel"
//     en vez de a cambio de pestaña).
//   - push: hacia/desde una vista de detalle (equipo, stats, auth) — el único
//     sitio donde se mantiene el desplazamiento lateral, por ser navegación
//     jerárquica y no lateral.
// Salida más rápida que la entrada en ambas, y duraciones fijas en vez de
// springs: con `mode="wait"` la entrante no se monta hasta que la saliente
// termina, así que una transición que "asienta" despacio (un spring sin
// restDelta) se percibe como un tirón entre pantallas.
const fadeVariants = {
  enter: { opacity: 0 },
  center: { opacity: 1, transition: TAB_ENTER },
  exit: { opacity: 0, transition: TAB_EXIT },
}

// Entra desde la derecha y sale hacia la izquierda: la salida va en dirección
// contraria a la entrada, si no la pantalla parece "rebotar" al mismo lado por
// el que vino. Desplazamiento corto (24px) — sugiere el movimiento sin que la
// vista viaje media pantalla en cada navegación.
const pushVariants = {
  enter: { x: 24, opacity: 0 },
  center: { x: 0, opacity: 1, transition: PANEL_ENTER },
  exit: { x: -24, opacity: 0, transition: PANEL_EXIT },
}

// prefers-reduced-motion: igual que el fade normal pero sin duración — ya no
// hay desplazamiento que quitarle a nada (push es la única familia con x).
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
  const variants = reduceMotion ? reducedVariants : isTab ? fadeVariants : pushVariants

  // Sin esto, al entrar a una vista nueva se hereda el scroll de la anterior
  // y la transición parece "saltar" a mitad de camino.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])

  return (
    <div className="motm-shell">
      <PullToRefresh />
      <main className="motm-shell__main">
        {/* `mode="wait"`: la saliente termina ANTES de montar la entrante, así
            nunca coexisten en el flujo (que era lo que hacía crecer el ancho
            del documento y disparaba la scrollbar lateral). `popLayout` sí
            las solapa, y al sacar la saliente del flujo sin darle dimensiones
            la página colapsaba a mitad de transición — se veía como un salto. */}
        <AnimatePresence mode="wait" initial={false}>
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
      </main>
      <BottomNav />
    </div>
  )
}
