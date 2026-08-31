import { useEffect, useState } from 'react'

// Ninguna parte dura más de esto en tiempo real, ni con VAR y lesiones largas.
// Si el ancla dice más, es que está podrida (partido que se quedó LIVE porque
// la fuente de estado se congeló) — mejor no pintar nada que pintar "1133'".
const MAX_HALF_MIN = 65

function minuteLabelFrom(halfStartedAt: string | null, halfNumber: number | null): string | null {
  if (!halfStartedAt || !halfNumber) return null
  const startedAtMs = Date.parse(halfStartedAt)
  if (Number.isNaN(startedAtMs)) return null
  const baseMinute = halfNumber === 2 ? 45 : 0
  const elapsedMin = (Date.now() - startedAtMs) / 60_000
  if (elapsedMin > MAX_HALF_MIN) return null
  return `${Math.max(baseMinute, Math.floor(baseMinute + elapsedMin))}'`
}

/**
 * Minuto que avanza segundo a segundo EN EL CLIENTE, sin volver a preguntarle
 * al backend en cada tick (el minuto no tiene que salir de la API todo el
 * rato). Se ancla a `halfStartedAt`/`halfNumber` — el momento real en que
 * liveLoop.ts confirmó el inicio de la parte actual — y desde ahí cuenta
 * tiempo real. El backend solo mueve esa ancla cuando la API confirma un
 * cambio real (nueva parte, tiempo añadido, corrección de fuente); ver
 * `nextClockAnchor` en backend/src/jobs/liveLoop.ts.
 *
 * La etiqueta se DERIVA en el render (no vive en estado): el estado es solo un
 * contador que fuerza el re-render cada segundo, así no hay un `setState`
 * síncrono dentro del efecto disparando renders en cascada al montar.
 *
 * Sin ancla (partido no LIVE, o aún sin datos) devuelve `null` y el caller
 * cae al `minuteLabel` estático de siempre.
 */
export function useLiveMinute(halfStartedAt: string | null, halfNumber: number | null): string | null {
  const [, setTick] = useState(0)
  const running = Boolean(halfStartedAt && halfNumber)

  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => setTick((t) => t + 1), 1000)
    return () => window.clearInterval(id)
  }, [running, halfStartedAt, halfNumber])

  return minuteLabelFrom(halfStartedAt, halfNumber)
}
