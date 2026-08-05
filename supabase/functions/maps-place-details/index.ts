// §8 opening hours: fetch a place's weekly opening-hours pattern on demand,
// via Places API (New) — this project only has the New Places API enabled,
// not the legacy Place Details endpoint. Pure Google-API proxy — the caller
// writes the result onto the specific event's `opening_hours` column
// themselves (normal RLS-governed update), so this function only needs to
// confirm the request comes from a signed-in user, not check trip
// membership for a specific event.
//
// Output opening_hours shape: { "0": {"open":"09:00","close":"17:00"}, ... }
// keyed by weekday, 0 = Sunday .. 6 = Saturday (matches JS Date#getDay()).
// Simplification: a period that closes after midnight (close.day !== open.day)
// is clamped to 23:59 the same day — overnight-spanning hours are rare for
// the categories this app schedules and not worth the added complexity yet.

import { createClient } from "jsr:@supabase/supabase-js@2";

const GOOGLE_MAPS_SERVER_KEY = Deno.env.get("GOOGLE_MAPS_SERVER_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function toHHMM(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), { status: 405 });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "unauthenticated" }), { status: 401 });
  }

  const { placeId } = await req.json();
  if (!placeId) {
    return new Response(JSON.stringify({ error: "placeId required" }), { status: 400 });
  }

  const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
    headers: {
      "X-Goog-Api-Key": GOOGLE_MAPS_SERVER_KEY,
      "X-Goog-FieldMask": "id,displayName,regularOpeningHours",
    },
  });
  const json = await res.json();

  if (!res.ok) {
    return new Response(
      JSON.stringify({ error: `place details lookup failed: ${json.error?.message ?? res.status}` }),
      { status: 502 },
    );
  }

  const periods = json.regularOpeningHours?.periods as
    | { open: { day: number; hour: number; minute: number }; close?: { day: number; hour: number; minute: number } }[]
    | undefined;

  if (!periods) {
    // No published hours (or open 24/7 with no periods array) — nothing to
    // constrain scheduling with; caller treats a null result as "unknown".
    return new Response(JSON.stringify({ openingHours: null }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const openingHours: Record<string, { open: string; close: string }> = {};
  for (const period of periods) {
    if (!period.close) continue; // open 24 hours that day — leave unconstrained
    openingHours[String(period.open.day)] = {
      open: toHHMM(period.open.hour, period.open.minute),
      close: period.close.day === period.open.day ? toHHMM(period.close.hour, period.close.minute) : "23:59",
    };
  }

  return new Response(JSON.stringify({ openingHours }), {
    headers: { "Content-Type": "application/json" },
  });
});
