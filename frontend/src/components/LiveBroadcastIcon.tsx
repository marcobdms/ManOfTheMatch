type Props = {
  size?: number
  /** Relleno del punto central, para igualar el `weight="fill"` de Phosphor
   *  cuando la pestaña está activa. */
  active?: boolean
  /** Solo se mueve si hay algo en juego. En reposo el icono es idéntico pero
   *  quieto: animar siempre era ruido y gasto de batería sin nada que mirar. */
  animated?: boolean
}

/** Icono "En vivo" del navbar. Es un SVG propio en vez del `BroadcastIcon` de
 *  Phosphor porque hay que animar sus piezas por separado: el punto late con
 *  las MISMAS keyframes que el del marcador (`motm-pulse`) y las dos parejas
 *  de ondas salen hacia fuera escalonadas.
 *
 *  Todo es CSS (opacidad + transform, por compositor): son 5 nodos sin
 *  JavaScript ni framer, así que puede quedarse animando siempre sin el coste
 *  que tenían las cartas de la alineación. Con `prefers-reduced-motion` se
 *  queda quieto y legible. */
export default function LiveBroadcastIcon({ size = 23, active = false, animated = false }: Props) {
  return (
    <svg
      className={'motm-liveico' + (animated ? ' is-animated' : '')}
      width={size}
      height={size}
      viewBox="0 0 256 256"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <circle
        className="motm-liveico__dot"
        cx="128"
        cy="128"
        r={active ? 22 : 18}
        fill="currentColor"
        stroke={active ? 'none' : 'currentColor'}
        strokeWidth="16"
      />

      {/* Ondas interiores: arcos a izquierda y derecha del punto. */}
      <g className="motm-liveico__wave motm-liveico__wave--1">
        <path
          d="M83.5 83.5a63 63 0 0 0 0 89"
          stroke="currentColor"
          strokeWidth="16"
          strokeLinecap="round"
        />
        <path
          d="M172.5 83.5a63 63 0 0 1 0 89"
          stroke="currentColor"
          strokeWidth="16"
          strokeLinecap="round"
        />
      </g>

      {/* Ondas exteriores: mismo arco, más abierto. */}
      <g className="motm-liveico__wave motm-liveico__wave--2">
        <path
          d="M55 55a103 103 0 0 0 0 146"
          stroke="currentColor"
          strokeWidth="16"
          strokeLinecap="round"
        />
        <path
          d="M201 55a103 103 0 0 1 0 146"
          stroke="currentColor"
          strokeWidth="16"
          strokeLinecap="round"
        />
      </g>
    </svg>
  )
}
