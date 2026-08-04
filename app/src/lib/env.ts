export const env = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
  googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string,
  // Map ID richiesto per gli Advanced Markers (Google Cloud Console → Map Management).
  // "DEMO_MAP_ID" funziona solo per sviluppo/test, non in produzione.
  googleMapsMapId: (import.meta.env.VITE_GOOGLE_MAPS_MAP_ID as string) || "DEMO_MAP_ID",
  vapidPublicKey: import.meta.env.VITE_VAPID_PUBLIC_KEY as string,
};

export function assertEnv() {
  const missing = Object.entries(env)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length > 0 && import.meta.env.PROD) {
    console.warn(`Variabili d'ambiente mancanti: ${missing.join(", ")}`);
  }
}
