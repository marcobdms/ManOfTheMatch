// Orden de las 5 pestañas del bottom nav — define la dirección del swipe
// entre ellas (izquierda↔derecha según el índice). Rutas de detalle (equipo,
// estadísticas, auth) no están aquí: usan un push vertical/horizontal propio,
// no un swipe de pestaña (ver App.tsx).
const TAB_ORDER = ['/home', '/proximos', '/', '/equipos', '/perfil']

export function tabIndex(pathname: string): number {
  return TAB_ORDER.indexOf(pathname)
}

export function isTabRoute(pathname: string): boolean {
  return tabIndex(pathname) !== -1
}
