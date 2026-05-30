// Service Worker — Ayres del Sur PWA
// Maneja precaching de assets (via vite-plugin-pwa injectManifest)
// y notificaciones push Web Push API.

import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { clientsClaim } from 'workbox-core'

// Tomar control inmediato de todos los clientes
self.skipWaiting()
clientsClaim()

// Limpiar caches viejos y precachear assets del build
cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

// ─── Push notifications ───────────────────────────────────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return
  let data
  try { data = event.data.json() } catch { return }

  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Ayres del Sur', {
      body:    data.body ?? '',
      icon:    '/icon-192.png',
      badge:   '/icon-192.png',
      vibrate: [100, 50, 100],
      data:    { url: data.url ?? '/' },
    })
  )
})

// ─── Click en notificación ────────────────────────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = event.notification.data?.url ?? '/'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      // Intentar foco en una ventana existente
      for (const client of list) {
        if ('focus' in client) {
          client.navigate(url)
          client.focus()
          return
        }
      }
      // Si no hay ventana abierta, abrir una nueva
      if (clients.openWindow) return clients.openWindow(url)
    })
  )
})
