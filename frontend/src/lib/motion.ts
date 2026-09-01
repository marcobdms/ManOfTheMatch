// Vocabulario de movimiento compartido — un solo sitio para las curvas/
// duraciones que antes se repetían (con pequeñas variaciones accidentales)
// en cada componente que animaba algo. Tres familias, cada una con un rol:
//
//   PANEL_ENTER/EXIT — algo entra y ocupa la pantalla (páginas, el menú
//     lateral, un colapsable): entrada con la curva "snappy" de siempre,
//     salida siempre más rápida que la entrada (menos sensación de espera).
//   STAGGER_ITEM — un elemento dentro de una lista/cancha que revela varios
//     a la vez con delay creciente.
//   MICRO — micro-interacciones cortas (indicador de tab activo).
export const EASE_OUT = [0.16, 1, 0.3, 1] as const

export const PANEL_ENTER = { duration: 0.22, ease: EASE_OUT }
export const PANEL_EXIT = { duration: 0.14, ease: 'easeIn' as const }


export const STAGGER_ITEM = { duration: 0.22, ease: 'easeOut' as const }

export const MICRO = { duration: 0.16, ease: 'easeOut' as const }
