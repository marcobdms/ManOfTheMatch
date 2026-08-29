// Auth de ManOfTheMatch sobre Supabase Auth (email + contraseña).
// El cliente de ./supabase ya guarda y renueva el JWT por su cuenta — este
// módulo solo envuelve las llamadas que necesita la UI.
//
// Confirmación manual: de momento no hay verificación de email automatizada
// (vendría después con Resend). Marco activa cada cuenta a mano desde el
// panel de Supabase. `signIn` traduce el error de "email no confirmado" de
// Supabase a un mensaje entendible en vez de mostrar el crudo.

import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

export const ACCOUNT_PENDING_MESSAGE =
  'Tu cuenta todavía no está activada. Un administrador debe confirmarla antes de que puedas entrar — vuelve a intentarlo más tarde.'

/** Traduce errores de Supabase Auth a mensajes en español, entendibles para quien no es técnico. */
function friendlyAuthError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('email not confirmed')) return ACCOUNT_PENDING_MESSAGE
  if (m.includes('invalid login credentials')) return 'Email o contraseña incorrectos.'
  if (m.includes('user already registered')) return 'Ya existe una cuenta con ese email.'
  if (m.includes('password should be at least')) return 'La contraseña debe tener al menos 6 caracteres.'
  return message
}

export type AuthResult = { error: string | null }

export async function signUp(email: string, password: string, displayName: string): Promise<AuthResult> {
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName || null } },
  })
  return { error: error ? friendlyAuthError(error.message) : null }
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  return { error: error ? friendlyAuthError(error.message) : null }
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut()
}

export async function getSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession()
  return data.session
}

export function onAuthStateChange(
  callback: (event: AuthChangeEvent, session: Session | null) => void,
): () => void {
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange(callback)
  return () => subscription.unsubscribe()
}
