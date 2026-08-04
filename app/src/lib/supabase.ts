import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);

// Niente generic `Database<>` qui: il tipo richiesto da supabase-js va generato
// con `supabase gen types typescript` una volta che il progetto esiste
// davvero (vedi supabase/SETUP.md). Nel frattempo le righe sono tipizzate a
// mano nei punti d'uso (src/types/database.ts) con un cast esplicito.
//
// Fallback placeholder so createClient never throws at import time when env
// vars are not yet set (e.g. before Supabase credentials are wired up).
// Callers should check `isSupabaseConfigured` before relying on real data.
export const supabase = createClient(
  env.supabaseUrl || "https://placeholder.supabase.co",
  env.supabaseAnonKey || "placeholder-anon-key",
);
