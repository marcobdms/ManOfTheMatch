// Avisos de UN partido concreto (tabla `match_subscriptions`, migración 0016).
// Independiente del equipo favorito: sirve para seguir un partido puntual sin
// tocar tu configuración de siempre.
//
// La suscripción es del DISPOSITIVO (endpoint de Web Push), no de la cuenta,
// así que requiere tener el push ya activado. `subscribeToMatch` devuelve el
// `PushStatus` para que la UI pueda pedir permisos o explicar por qué no se
// puede (iOS sin instalar, permiso denegado, etc.) en vez de fallar en seco.

import { supabase } from './supabase'
import { enablePush, getPushStatus, pushSupported, type PushStatus } from './push'
import type { PushPrefs } from './AuthProvider'

async function currentEndpoint(): Promise<string | null> {
  if (!pushSupported()) return null
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    return sub?.endpoint ?? null
  } catch {
    return null
  }
}

/** ¿Está este dispositivo suscrito a los avisos de este partido? */
export async function isSubscribedToMatch(fixtureId: string): Promise<boolean> {
  const endpoint = await currentEndpoint()
  if (!endpoint) return false
  const { data } = await supabase
    .from('match_subscriptions')
    .select('id')
    .eq('fixture_id', fixtureId)
    .eq('endpoint', endpoint)
    .maybeSingle()
  return !!data
}

/**
 * Activa los avisos de este partido. Si el dispositivo aún no tiene el push
 * activado, lo activa primero (pidiendo permiso al usuario) reutilizando
 * `enablePush` — así el botón funciona a la primera sin obligar a pasar antes
 * por Perfil. Devuelve el estado resultante: solo `'enabled'` significa que
 * quedó suscrito.
 */
export async function subscribeToMatch(
  fixtureId: string,
  userId: string | null,
  favoriteTeamId: string | null,
  prefs: PushPrefs,
): Promise<PushStatus> {
  let status = await getPushStatus()
  if (status === 'disabled') status = await enablePush(userId, favoriteTeamId, prefs)
  if (status !== 'enabled') return status

  const endpoint = await currentEndpoint()
  if (!endpoint) return 'disabled'

  const { error } = await supabase
    .from('match_subscriptions')
    .upsert({ fixture_id: fixtureId, endpoint }, { onConflict: 'fixture_id,endpoint' })
  if (error) throw error
  return 'enabled'
}

/** Desactiva los avisos de este partido (no toca el push del dispositivo). */
export async function unsubscribeFromMatch(fixtureId: string): Promise<void> {
  const endpoint = await currentEndpoint()
  if (!endpoint) return
  await supabase
    .from('match_subscriptions')
    .delete()
    .eq('fixture_id', fixtureId)
    .eq('endpoint', endpoint)
}
