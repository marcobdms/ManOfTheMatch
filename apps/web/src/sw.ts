/// <reference lib="webworker" />
//
// Custom service worker for ManOfTheMatch (vite-plugin-pwa `injectManifest`).
// Handles the PWA precache/offline shell plus Web Push for goal notifications.

import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

declare const self: ServiceWorkerGlobalScope

// Precache the build output that vite-plugin-pwa injects here.
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// SPA fallback: serve index.html for navigations (except /api/*).
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), {
    denylist: [/^\/api\//],
  }),
)

// autoUpdate: take control as soon as a new SW is available.
self.addEventListener('install', () => {
  void self.skipWaiting()
})
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

type PushPayload = {
  title?: string
  body?: string
  tag?: string
  url?: string
}

self.addEventListener('push', (event) => {
  let payload: PushPayload = {}
  try {
    payload = event.data ? (event.data.json() as PushPayload) : {}
  } catch {
    payload = { body: event.data?.text() }
  }

  const title = payload.title ?? 'ManOfTheMatch'
  const options: NotificationOptions = {
    body: payload.body ?? '',
    tag: payload.tag,
    icon: '/icons/pwa-192.png',
    badge: '/icons/pwa-192.png',
    data: { url: payload.url ?? '/' },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetPath =
    (event.notification.data as { url?: string } | undefined)?.url ?? '/'
  const targetUrl = new URL(targetPath, self.location.origin).href

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })
      const existing = clients.find(
        (client): client is WindowClient => 'focus' in client,
      )
      if (existing) {
        await existing.focus()
        if ('navigate' in existing) {
          await existing.navigate(targetUrl).catch(() => undefined)
        }
        return
      }
      await self.clients.openWindow(targetUrl)
    })(),
  )
})
