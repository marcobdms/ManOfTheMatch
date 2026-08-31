/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** Supabase project URL — set in frontend/.env.local (see .env.example). */
  readonly VITE_SUPABASE_URL?: string
  /** Supabase anon key (RLS: public read only). */
  readonly VITE_SUPABASE_ANON_KEY?: string
  /** VAPID public key for Web Push `pushManager.subscribe`. */
  readonly VITE_VAPID_PUBLIC_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
