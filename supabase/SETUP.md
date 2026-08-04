# Setup Supabase

1. Crea un progetto su https://supabase.com (piano Free è sufficiente per questo gruppo).
2. Installa la CLI e collega il progetto:
   ```bash
   npx supabase login
   npx supabase link --project-ref <project-ref>
   ```
3. Applica le migration:
   ```bash
   npx supabase db push
   ```
4. In Authentication → Providers, verifica che "Email" (magic link / OTP) sia abilitato e che "Confirm email" non blocchi il primo accesso via OTP.
5. Compila `supabase/seed.sql` con le email del gruppo in `trip_invites` (vedi sezione sotto), poi eseguilo dalla dashboard SQL editor o con `npx supabase db push` se incluso nelle migration.
6. Copia URL e anon key del progetto (Project Settings → API) in `app/.env`:
   ```
   VITE_SUPABASE_URL=...
   VITE_SUPABASE_ANON_KEY=...
   ```
7. Per lo script di import (`scripts/import-events.ts`) serve anche la **service role key** (Project Settings → API → service_role) — non va mai nel frontend, solo in una variabile d'ambiente locale usata una tantum per il seed:
   ```
   SUPABASE_SERVICE_ROLE_KEY=...
   ```

## Email del gruppo

Modifica `supabase/seed.sql`: sostituisci gli indirizzi placeholder in `trip_invites` con le email reali dei partecipanti — solo queste potranno accedere (vedi trigger `handle_new_user` nella migration).

## Stato voli in tempo reale (edge function `flight-status`)

Usa [AeroDataBox](https://aerodatabox.com/) via [RapidAPI](https://rapidapi.com/aedbx-aedbx/api/aerodatabox) per aggiornare ritardo/stato dei voli tracciati (eventi con `flight_number` e `flight_leg` valorizzati).

1. Crea un account RapidAPI e sottoscrivi il piano gratuito di AeroDataBox, poi copia la tua API key.
2. Imposta il secret sulla funzione:
   ```bash
   npx supabase secrets set AERODATABOX_RAPIDAPI_KEY=<la-tua-key>
   ```
3. Deploya la funzione:
   ```bash
   npx supabase functions deploy flight-status
   ```
4. In Integrations → Cron Jobs, crea un job che invochi `flight-status` ogni 3 ore circa (i dati live sono comunque disponibili solo a ridosso del volo, e il piano free ha un limite di richieste mensili).
5. Per ogni evento-volo da tracciare, imposta `flight_number` (es. `LH964`) e `flight_leg` (`departure` o `arrival`, a seconda di quale tappa del volo rappresenta l'evento).
