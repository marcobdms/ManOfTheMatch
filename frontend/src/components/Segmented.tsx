import { Children, isValidElement, type ReactNode } from 'react'

// La pastilla vive en el CARRIL, no dentro del botón activo, y se desplaza con
// un `transform` propio. Antes era un `layoutId` de framer-motion, y su
// proyección es contra el viewport: si algo de ARRIBA cambiaba de alto entre
// renders (la tarjeta destacada de Home al resolverse la consulta), framer
// medía la pastilla en su posición vieja y la animaba desde allí — se veía
// salir disparada hacia arriba y volver a su sitio. Con un transform local un
// desplazamiento del ancestro no la afecta: solo se mueve al cambiar de opción.

export function Segmented({
  id,
  ariaLabel,
  children,
}: {
  id: string
  ariaLabel: string
  children: ReactNode
}) {
  // `toArray` aplana fragmentos y arrays (MatchStats/MatchPredictions pintan
  // los botones con .map) y descarta los null/false de renders condicionales.
  const items = Children.toArray(children)
  const count = items.length
  const active = Math.max(
    0,
    items.findIndex((c) => isValidElement<{ active?: boolean }>(c) && c.props.active === true),
  )

  return (
    <div className="motm-segmented" role="group" aria-label={ariaLabel} data-seg={id}>
      {count > 0 && (
        <span
          className="motm-segmented__pill"
          aria-hidden="true"
          style={{
            // El % de un absoluto se resuelve contra la caja de relleno del
            // carril, así que se descuenta el padding además de los huecos.
            width: `calc((100% - 2 * var(--seg-pad) - ${count - 1} * var(--seg-gap)) / ${count})`,
            transform: `translateX(calc(${active} * (100% + var(--seg-gap))))`,
          }}
        />
      )}
      {items}
    </div>
  )
}

export function SegmentedButton({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className="motm-segmented__btn"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="motm-segmented__label">{children}</span>
    </button>
  )
}
