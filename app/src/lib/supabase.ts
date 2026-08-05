import { createClient } from "@supabase/supabase-js";

// Client-safe values only (VITE_ prefix ships to the browser bundle) — the
// service-role key never lives here, only inside Edge Functions (02 C1).
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — check app/.env.local",
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
