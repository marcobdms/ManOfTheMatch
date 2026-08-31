import { registerSW } from 'virtual:pwa-register'

/**
 * Registro del service worker con actualización real.
 *
 * El `registerSW.js` que inyecta vite-plugin-pwa por defecto solo hace
 * `register()` dentro del evento `load` y nada más: no vuelve a comprobar si
 * hay versión nueva ni recarga cuando entra. En una PWA instalada en iOS eso
 * es fatal — la app casi nunca arranca en frío (se reanuda), así que `load`
 * no se dispara y el usuario se queda con el HTML/CSS/JS cacheados para
 * siempre, aunque el deploy ya esté en producción. Es exactamente lo que
 * pasó con el arreglo del notch: el CSS correcto estaba servido en Vercel y
 * la PWA seguía pintando el viejo.
 *
 * Aquí se registra a mano (vite.config.ts: `injectRegister: null`) y además:
 *  - se comprueba si hay versión nueva cada vez que la app vuelve a primer
 *    plano (el momento en que una PWA de iOS "despierta"),
 *  - y una vez por hora mientras siga abierta,
 *  - y cuando el service worker nuevo toma el control, se recarga una sola
 *    vez para que la página pase a usar los assets nuevos.
 */
export function setupPwaUpdates(): void {
  if (!('serviceWorker' in navigator)) return

  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return
    reloading = true
    window.location.reload()
  })

  registerSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      if (!registration) return
      const check = () => void registration.update().catch(() => undefined)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check()
      })
      window.setInterval(check, 60 * 60 * 1000)
    },
  })
}
