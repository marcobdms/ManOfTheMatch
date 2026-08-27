// Web Push subscribe/unsubscribe for the per-match notification bell.
// Framework-agnostic — Live.tsx wraps this in a tiny bit of state.
//
// iOS reality: Safari only exposes Web Push when the site runs as an installed
// PWA (Add to Home Screen). When that isn't the case we return a state the UI
// turns into an inline explainer instead of throwing.

import { supabase } from './supabase'

export type PushStatus =
  | 'unsupported' // no serviceWorker / PushManager / Notification
  | 'needs-install' // not running as an installed PWA (display-mode: standalone)
  | 'no-vapid' // VITE_VAPID_PUBLIC_KEY not configured
  | 'denied' // Notification permission denied
  | 'disabled' // supported + allowed, not subscribed
  | 'enabled' // subscribed and stored

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? ''

export function pushSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window &&
    'Notification' in window
  )
}

/** True when launched from the home screen (iOS) or any standalone display mode. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const mm = window.matchMedia?.('(display-mode: standalone)').matches ?? false
  const iosStandalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  return mm || iosStandalone
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i)
  return output
}

/** Non-mutating check of the current state, safe to call on mount. */
export async function getPushStatus(): Promise<PushStatus> {
  if (!pushSupported()) return 'unsupported'
  if (!isStandalone()) return 'needs-install'
  if (Notification.permission === 'denied') return 'denied'
  if (!VAPID_PUBLIC_KEY) return 'no-vapid'
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    return sub ? 'enabled' : 'disabled'
  } catch {
    return 'disabled'
  }
}

/** Request permission, subscribe, and persist the subscription row. */
export async function enablePush(): Promise<PushStatus> {
  if (!pushSupported()) return 'unsupported'
  if (!isStandalone()) return 'needs-install'
  if (!VAPID_PUBLIC_KEY) return 'no-vapid'

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return 'denied'

  const reg = await navigator.serviceWorker.ready
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    }))

  const json = sub.toJSON()
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      endpoint: sub.endpoint,
      p256dh: json.keys?.p256dh ?? '',
      auth: json.keys?.auth ?? '',
      user_agent: navigator.userAgent,
    },
    { onConflict: 'endpoint' },
  )
  if (error) {
    // Keep the browser subscription; surface the failure to the caller.
    throw error
  }
  return 'enabled'
}

/** Unsubscribe locally and drop the stored row. */
export async function disablePush(): Promise<PushStatus> {
  if (!pushSupported()) return 'unsupported'

  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (sub) {
    // NOTE: push_subscriptions currently has no anon DELETE policy — this row
    // delete may be a no-op until the backend adds one (see handoff doc). The
    // browser-side unsubscribe below still stops delivery to this device.
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
    await sub.unsubscribe()
  }
  return 'disabled'
}
