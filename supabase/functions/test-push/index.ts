// Utility di test: invia subito un push all'utente autenticato, ignorando
// tutte le regole di 05-notification-rules.md. Serve solo per verificare che
// la catena VAPID → service worker → browser funzioni prima che il viaggio
// inizi davvero. Non fa parte delle funzionalità richieste dalle spec.

import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

// Chiamata da fetch() nel browser (SettingsPage): senza header CORS il
// browser blocca la richiesta prima ancora che arrivi qui ("Failed to fetch").
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response("Missing Authorization header", { status: 401, headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: userData, error: userError } = await createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  ).auth.getUser();
  if (userError || !userData.user) {
    return new Response("Invalid token", { status: 401, headers: corsHeaders });
  }

  const { data: settings, error: settingsError } = await supabase
    .from("user_settings")
    .select("push_subscription")
    .eq("user_id", userData.user.id)
    .limit(1)
    .maybeSingle();

  if (settingsError || !settings?.push_subscription) {
    return new Response("Nessuna sottoscrizione push trovata per questo utente", {
      status: 404,
      headers: corsHeaders,
    });
  }

  webpush.setVapidDetails(
    Deno.env.get("VAPID_SUBJECT")!,
    Deno.env.get("VAPID_PUBLIC_KEY")!,
    Deno.env.get("VAPID_PRIVATE_KEY")!,
  );

  try {
    await webpush.sendNotification(
      settings.push_subscription as unknown as webpush.PushSubscription,
      JSON.stringify({
        title: "Test — Scozia 2026",
        body: "Se vedi questo, le notifiche push funzionano!",
        tag: "test-push",
      }),
    );
  } catch (err) {
    return new Response(`Push send failed: ${err instanceof Error ? err.message : String(err)}`, {
      status: 500,
      headers: corsHeaders,
    });
  }

  return new Response("OK, notifica inviata", { status: 200, headers: corsHeaders });
});
