// Contexto de sesión + perfil. El favorito y las preferencias de notificación
// viven SOLO en `profiles` (BD) — no hay fallback a localStorage (decisión
// tomada: aún no hay usuarios, no hay nada que perder).
//
// `profile` es null tanto "sin sesión" como "sesión sin perfil cargado
// todavía" — usar `sessionLoading`/`profileLoading` para distinguir estados de
// carga en la UI.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { getSession, onAuthStateChange } from './auth'
import { supabase } from './supabase'

export type PushPrefs = { matchday: boolean; kickoff: boolean; lineup: boolean; goals: boolean }

export const DEFAULT_PREFS: PushPrefs = { matchday: true, kickoff: true, lineup: true, goals: true }

export type Profile = {
  id: string
  display_name: string | null
  favorite_team_id: string | null
  prefs: PushPrefs
}

type ProfileRow = {
  id: string
  display_name: string | null
  favorite_team_id: string | null
  prefs: Partial<PushPrefs> | null
}

function normalizeProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    display_name: row.display_name,
    favorite_team_id: row.favorite_team_id,
    prefs: { ...DEFAULT_PREFS, ...(row.prefs ?? {}) },
  }
}

type AuthContextValue = {
  session: Session | null
  sessionLoading: boolean
  profile: Profile | null
  profileLoading: boolean
  refreshProfile: () => Promise<void>
  updateProfile: (patch: Partial<Pick<Profile, 'display_name' | 'favorite_team_id' | 'prefs'>>) => Promise<{ error: string | null }>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)

  const loadProfile = useCallback(async (userId: string) => {
    setProfileLoading(true)
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name, favorite_team_id, prefs')
        .eq('id', userId)
        .maybeSingle()
        .returns<ProfileRow | null>()
      if (error) throw error
      setProfile(data ? normalizeProfile(data) : null)
    } catch {
      setProfile(null)
    } finally {
      setProfileLoading(false)
    }
  }, [])

  useEffect(() => {
    let alive = true
    getSession()
      .then((s) => {
        if (!alive) return
        setSession(s)
        setSessionLoading(false)
        if (s?.user.id) void loadProfile(s.user.id)
      })
      .catch(() => {
        if (alive) setSessionLoading(false)
      })

    const unsubscribe = onAuthStateChange((_event, s) => {
      setSession(s)
      setSessionLoading(false)
      if (s?.user.id) void loadProfile(s.user.id)
      else setProfile(null)
    })

    return () => {
      alive = false
      unsubscribe()
    }
  }, [loadProfile])

  const refreshProfile = useCallback(async () => {
    if (session?.user.id) await loadProfile(session.user.id)
  }, [session, loadProfile])

  const updateProfile = useCallback<AuthContextValue['updateProfile']>(
    async (patch) => {
      if (!session?.user.id) return { error: 'No has iniciado sesión.' }
      const { data, error } = await supabase
        .from('profiles')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', session.user.id)
        .select('id, display_name, favorite_team_id, prefs')
        .single()
        .returns<ProfileRow>()
      if (error) return { error: error.message }
      setProfile(normalizeProfile(data))
      return { error: null }
    },
    [session],
  )

  const value = useMemo<AuthContextValue>(
    () => ({ session, sessionLoading, profile, profileLoading, refreshProfile, updateProfile }),
    [session, sessionLoading, profile, profileLoading, refreshProfile, updateProfile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}
