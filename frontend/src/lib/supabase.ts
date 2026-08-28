import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anon) {
  console.warn('[supabase] faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (ver .env.example)')
}

/** Anon client — only reads the public (RLS: select using true) tables. */
export const supabase = createClient(url ?? '', anon ?? '')
