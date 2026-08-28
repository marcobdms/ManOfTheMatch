import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  throw new Error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (ver backend/.env.example)');
}

/** Service-role client. Bypasses RLS — never expose this key to the browser. */
export const db = createClient(url, key, { auth: { persistSession: false } });
