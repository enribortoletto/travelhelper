// §6 travel-time/distance estimation, §6 per-trip travel-mode overrides,
// §6 shared (origin, destination, mode) cache.
//
// Input:  { tripId, originPlaceId, destinationPlaceId, mode? } — mode defaults
//         to "driving" per §6's default rule; a matching travel_mode_overrides
//         row always wins over whatever mode was requested.
// Output: { durationSeconds, distanceMeters, mode, cached }

import { createClient } from "jsr:@supabase/supabase-js@2";

const GOOGLE_MAPS_SERVER_KEY = Deno.env.get("GOOGLE_MAPS_SERVER_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Mode = "driving" | "walking" | "transit";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), { status: 405 });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const { tripId, originPlaceId, destinationPlaceId, mode: requestedMode } = await req.json();

  if (!tripId || !originPlaceId || !destinationPlaceId) {
    return new Response(JSON.stringify({ error: "tripId, originPlaceId, destinationPlaceId required" }), {
      status: 400,
    });
  }

  // RLS-scoped client: proves the caller is actually a member of tripId
  // before this function spends a paid Google API call on their behalf.
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: trip, error: tripError } = await userClient
    .from("trips")
    .select("id")
    .eq("id", tripId)
    .maybeSingle();
  if (tripError || !trip) {
    return new Response(JSON.stringify({ error: "not a member of this trip" }), { status: 403 });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Per-trip override always wins over the requested/default mode (§6).
  // Overrides aren't inherently directional, so check the pair both ways.
  const { data: override } = await admin
    .from("travel_mode_overrides")
    .select("mode")
    .eq("trip_id", tripId)
    .or(
      `and(place_id_a.eq.${originPlaceId},place_id_b.eq.${destinationPlaceId}),and(place_id_a.eq.${destinationPlaceId},place_id_b.eq.${originPlaceId})`,
    )
    .maybeSingle();

  const mode: Mode = override?.mode ?? requestedMode ?? "driving";

  const { data: cached } = await admin
    .from("travel_time_cache")
    .select("duration_seconds, distance_meters")
    .eq("origin_place_id", originPlaceId)
    .eq("destination_place_id", destinationPlaceId)
    .eq("mode", mode)
    .maybeSingle();

  if (cached) {
    return new Response(
      JSON.stringify({ durationSeconds: cached.duration_seconds, distanceMeters: cached.distance_meters, mode, cached: true }),
      { headers: { "Content-Type": "application/json" } },
    );
  }

  const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
  url.searchParams.set("origin", `place_id:${originPlaceId}`);
  url.searchParams.set("destination", `place_id:${destinationPlaceId}`);
  url.searchParams.set("mode", mode);
  url.searchParams.set("key", GOOGLE_MAPS_SERVER_KEY);

  const res = await fetch(url);
  const json = await res.json();

  if (json.status !== "OK" || !json.routes?.[0]?.legs?.[0]) {
    // Transient/failed lookup: never cached, so the next request retries.
    return new Response(JSON.stringify({ error: `directions lookup failed: ${json.status}` }), { status: 502 });
  }

  const leg = json.routes[0].legs[0];
  const durationSeconds: number = leg.duration.value;
  const distanceMeters: number = leg.distance.value;

  await admin.from("travel_time_cache").upsert({
    origin_place_id: originPlaceId,
    destination_place_id: destinationPlaceId,
    mode,
    duration_seconds: durationSeconds,
    distance_meters: distanceMeters,
    fetched_at: new Date().toISOString(),
  });

  return new Response(JSON.stringify({ durationSeconds, distanceMeters, mode, cached: false }), {
    headers: { "Content-Type": "application/json" },
  });
});
