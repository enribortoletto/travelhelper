// §14 AI itinerary-editing assistant — Flows 1-3. Every flow here only
// *computes a proposal* and stores it as a pending ai_previews row; nothing
// is ever written to `events` from this function. Confirming a preview
// (a direct client update of ai_previews.status, already RLS-permitted) is
// what actually applies it, via the ai_previews_apply_on_confirm trigger
// (see supabase/migrations/20260811000000_ai_previews_apply_on_confirm.sql).
//
// Deliberately no LLM call anywhere in this file: every field a flow
// proposes either comes straight from a Places API lookup or from a fixed,
// labeled-as-generic rule (a per-category default visit duration) — never a
// fabricated place-specific fact, per §14's guardrail.

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GOOGLE_MAPS_SERVER_KEY = Deno.env.get("GOOGLE_MAPS_SERVER_KEY")!;

// ---------------------------------------------------------------- helpers

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function shiftTime(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  if (total >= 24 * 60) return "23:59:59";
  const clamped = Math.max(0, total);
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}:00`;
}

function fallbackEndTime(startTime: string): string {
  return shiftTime(startTime, 60);
}

function weekdayOf(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** §14 Flow 1: ~15min break per hour of driving, applied to legs over ~20-25 min. */
function applyBreakAllowance(durationMinutes: number): number {
  if (durationMinutes <= 22) return durationMinutes;
  return durationMinutes + Math.round((durationMinutes / 60) * 15);
}

function isAccommodation(stop: any, categories: any[]): boolean {
  return categories.find((c) => c.id === stop.category_id)?.name === "accommodation";
}

function legalStartWindow(openingHours: any, day: string, visitDurationMinutes: number | null, isFoodService: boolean, kitchenClosingTime: string | null) {
  if (!openingHours) return { earliest: null as string | null, latest: null as string | null };
  const hours = openingHours[String(weekdayOf(day))];
  if (!hours) return { earliest: null, latest: null };
  const closing = isFoodService ? kitchenClosingTime ?? shiftTime(hours.close, -60) : hours.close;
  const latest = visitDurationMinutes != null ? shiftTime(closing, -visitDurationMinutes) : null;
  return { earliest: hours.open as string, latest };
}

async function getTravelEstimate(admin: SupabaseClient, tripId: string, originPlaceId: string, destinationPlaceId: string): Promise<number | null> {
  const { data: override } = await admin
    .from("travel_mode_overrides")
    .select("mode")
    .eq("trip_id", tripId)
    .or(`and(place_id_a.eq.${originPlaceId},place_id_b.eq.${destinationPlaceId}),and(place_id_a.eq.${destinationPlaceId},place_id_b.eq.${originPlaceId})`)
    .maybeSingle();
  const mode = override?.mode ?? "driving";

  const { data: cached } = await admin
    .from("travel_time_cache")
    .select("duration_seconds")
    .eq("origin_place_id", originPlaceId)
    .eq("destination_place_id", destinationPlaceId)
    .eq("mode", mode)
    .maybeSingle();
  if (cached) return applyBreakAllowance(Math.round(cached.duration_seconds / 60));

  const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
  url.searchParams.set("origin", `place_id:${originPlaceId}`);
  url.searchParams.set("destination", `place_id:${destinationPlaceId}`);
  url.searchParams.set("mode", mode);
  url.searchParams.set("key", GOOGLE_MAPS_SERVER_KEY);
  const res = await fetch(url);
  const json = await res.json();
  if (json.status !== "OK" || !json.routes?.[0]?.legs?.[0]) return null;
  const leg = json.routes[0].legs[0];
  await admin.from("travel_time_cache").upsert({
    origin_place_id: originPlaceId,
    destination_place_id: destinationPlaceId,
    mode,
    duration_seconds: leg.duration.value,
    distance_meters: leg.distance.value,
    fetched_at: new Date().toISOString(),
  });
  return applyBreakAllowance(Math.round(leg.duration.value / 60));
}

function buildDaySequence(day: string, allStops: any[], categories: any[]): any[] {
  function shiftDay(d: string, delta: number): string {
    const [y, m, dd] = d.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, dd + delta));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
  }
  const accommodations = allStops.filter((s) => !s.is_derived && !s.is_skipped && s.planning_status === "planned" && isAccommodation(s, categories));
  const prevAccommodation = accommodations.find((s) => s.day === shiftDay(day, -1)) ?? null;
  const nextAccommodation = accommodations.find((s) => s.day === day) ?? null;
  const middle = allStops
    .filter((s) => !s.is_derived && !s.is_skipped && s.planning_status === "planned" && s.day === day && !isAccommodation(s, categories) && s.start_time)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
  return [prevAccommodation, ...middle, nextAccommodation].filter(Boolean);
}

// ------------------------------------------------------- Places lookups

const CATEGORY_BY_TYPE: Record<string, string> = {
  restaurant: "meal", cafe: "meal", bar: "meal", bakery: "meal", meal_takeaway: "meal", meal_delivery: "meal",
  lodging: "accommodation", hotel: "accommodation",
  airport: "transport", train_station: "transport", bus_station: "transport", subway_station: "transport", transit_station: "transport", light_rail_station: "transport",
};
const VISIT_DURATION_BY_CATEGORY: Record<string, number> = { meal: 60, activity: 90, transport: 30, note: 15 };

function toHHMM(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

async function lookupPlace(query: string | undefined, placeId: string | undefined) {
  const fieldMask = "id,displayName,types,regularOpeningHours,editorialSummary,googleMapsUri";
  if (placeId) {
    const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
      headers: { "X-Goog-Api-Key": GOOGLE_MAPS_SERVER_KEY, "X-Goog-FieldMask": fieldMask },
    });
    if (!res.ok) return null;
    return await res.json();
  }
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE_MAPS_SERVER_KEY,
      "X-Goog-FieldMask": `places.${fieldMask.split(",").join(",places.")}`,
    },
    body: JSON.stringify({ textQuery: query }),
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.places?.[0] ?? null;
}

function openingHoursFromPlace(place: any): Record<string, { open: string; close: string }> | null {
  const periods = place.regularOpeningHours?.periods;
  if (!periods) return null;
  const openingHours: Record<string, { open: string; close: string }> = {};
  for (const period of periods) {
    if (!period.close) continue;
    openingHours[String(period.open.day)] = {
      open: toHHMM(period.open.hour, period.open.minute),
      close: period.close.day === period.open.day ? toHHMM(period.close.hour, period.close.minute) : "23:59",
    };
  }
  return openingHours;
}

// ------------------------------------------------------------- Flow 1

async function flowAddStop(admin: SupabaseClient, tripId: string, userId: string, body: any) {
  const place = await lookupPlace(body.query, body.placeId);
  if (!place) return { error: "Couldn't find that place — try a more specific name or paste a Google Maps link." };

  const { data: categories } = await admin.from("categories").select("*").eq("trip_id", tripId);
  const guessedCategoryName = (place.types ?? []).map((t: string) => CATEGORY_BY_TYPE[t]).find(Boolean) ?? "activity";
  const category = categories!.find((c: any) => c.name === guessedCategoryName) ?? categories!.find((c: any) => c.name === "activity") ?? categories![0];
  const visitDurationMinutes = VISIT_DURATION_BY_CATEGORY[category.name] ?? 60;
  const openingHours = category.name === "accommodation" || category.name === "transport" ? null : openingHoursFromPlace(place);

  const day: string | null = body.day ?? null;
  // Guardrail (§14): never propose an accommodation stop as optional — it's always planned.
  const planningStatus = category.name === "accommodation" ? "planned" : body.planningStatus === "optional" ? "optional" : "planned";
  const conflicts: any[] = [];
  let startTime: string | null = null;
  let endTime: string | null = null;

  if (day) {
    const { data: trip } = await admin.from("trips").select("*").eq("id", tripId).single();
    const { data: allStops } = await admin.from("events").select("*").eq("trip_id", tripId);
    const sequence = buildDaySequence(day, allStops ?? [], categories!);

    let placed = false;
    for (let i = 0; i <= sequence.length; i++) {
      const prev = sequence[i - 1] ?? null;
      const next = sequence[i] ?? null;
      const gapStart = prev ? prev.end_time ?? (prev.start_time ? fallbackEndTime(prev.start_time) : trip!.default_day_start) : trip!.default_day_start;
      const gapEnd = next?.start_time ?? "23:00:00";

      let travelTo = 0;
      let travelFrom = 0;
      let travelKnown = true;
      if (prev?.maps_place_id && place.id) {
        const est = await getTravelEstimate(admin, tripId, prev.maps_place_id, place.id);
        if (est == null) travelKnown = false;
        else travelTo = est;
      }
      if (next?.maps_place_id && place.id) {
        const est = await getTravelEstimate(admin, tripId, place.id, next.maps_place_id);
        if (est == null) travelKnown = false;
        else travelFrom = est;
      }

      const needed = travelTo + visitDurationMinutes + travelFrom;
      if (timeToMinutes(gapEnd) - timeToMinutes(gapStart) >= needed) {
        startTime = shiftTime(gapStart, travelTo);
        endTime = shiftTime(startTime, visitDurationMinutes);
        placed = true;
        if (!travelKnown) conflicts.push({ kind: "travel_time_unknown", message: "Couldn't verify travel time for part of this slot — no resolvable place on one side." });
        break;
      }
    }

    if (!placed) {
      const last = sequence[sequence.length - 1] ?? null;
      const gapStart = last ? last.end_time ?? (last.start_time ? fallbackEndTime(last.start_time) : trip!.default_day_start) : trip!.default_day_start;
      let travelTo = 0;
      if (last?.maps_place_id && place.id) {
        travelTo = (await getTravelEstimate(admin, tripId, last.maps_place_id, place.id)) ?? 0;
      }
      startTime = shiftTime(gapStart, travelTo);
      endTime = shiftTime(startTime, visitDurationMinutes);
      conflicts.push({ kind: "no_comfortable_slot", message: "No gap in the day comfortably fits this stop — placed at the end of the day instead." });
    }

    if (openingHours && startTime) {
      const window = legalStartWindow(openingHours, day, visitDurationMinutes, category.name === "meal", null);
      const startMinutes = timeToMinutes(startTime);
      if (window.earliest && startMinutes < timeToMinutes(window.earliest)) {
        conflicts.push({ kind: "opening_hours", message: `Opens at ${window.earliest.slice(0, 5)}, after the proposed start time.` });
      }
      if (window.latest && startMinutes > timeToMinutes(window.latest)) {
        conflicts.push({ kind: "opening_hours", message: `Latest legal start is ${window.latest.slice(0, 5)} — the proposed time is later than that.` });
      }
    }
  }

  const create = {
    category_id: category.id,
    name: place.displayName?.text ?? body.query ?? "New stop",
    day,
    start_time: startTime,
    end_time: endTime,
    planning_status: planningStatus,
    description: place.editorialSummary?.text ?? null,
    maps_place_id: place.id,
    maps_link: place.googleMapsUri ?? null,
    visit_duration_minutes: visitDurationMinutes,
    opening_hours: openingHours,
  };

  const summary = day
    ? `Add "${create.name}" (${category.name}) on ${day}${startTime ? ` at ${startTime.slice(0, 5)}` : ""}.`
    : `Add "${create.name}" (${category.name}) to the backlog, unscheduled.`;

  return {
    proposed_changes: { flow: "add_stop", day, creates: [create], conflicts, summary },
    day,
    conflicts,
    summary,
  };
}

// ------------------------------------------------------------- Flow 2

async function flowRemoveStop(admin: SupabaseClient, tripId: string, body: any) {
  const { data: target } = await admin.from("events").select("*").eq("id", body.eventId).single();
  if (!target) return { error: "Stop not found." };
  if (target.is_derived) return { error: "Can't remove a derived transit/check-in/check-out event directly — edit the stops it connects instead." };
  if (!target.day) {
    return {
      proposed_changes: { flow: "remove_stop", day: null, deletes: [{ event_id: target.id, mode: body.mode ?? "delete" }], conflicts: [], summary: `Remove "${target.name}".` },
      day: null,
      conflicts: [],
      summary: `Remove "${target.name}".`,
    };
  }

  const { data: categories } = await admin.from("categories").select("*").eq("trip_id", tripId);
  const { data: allStops } = await admin.from("events").select("*").eq("trip_id", tripId);
  const before = buildDaySequence(target.day, allStops ?? [], categories!);
  const after = before.filter((s) => s.id !== target.id);

  const conflicts: any[] = [];
  for (let i = 0; i < after.length - 1; i++) {
    const origin = after[i];
    const destination = after[i + 1];
    if (!origin.maps_place_id || !destination.maps_place_id || !destination.start_time) continue;
    const wasAdjacentBefore = before.some((s, idx) => s.id === origin.id && before[idx + 1]?.id === destination.id);
    if (wasAdjacentBefore) continue; // this leg already existed, nothing new to check

    const originDeparture = origin.end_time ?? (origin.start_time ? fallbackEndTime(origin.start_time) : null);
    if (!originDeparture) continue;
    const travelMinutes = await getTravelEstimate(admin, tripId, origin.maps_place_id, destination.maps_place_id);
    if (travelMinutes == null) continue;
    const arrival = shiftTime(originDeparture, travelMinutes);
    if (timeToMinutes(arrival) > timeToMinutes(destination.start_time)) {
      conflicts.push({
        kind: "insufficient_travel_time",
        eventId: destination.id,
        message: `Without "${target.name}", the trip from "${origin.name}" to "${destination.name}" now arrives around ${arrival.slice(0, 5)} — after its ${destination.start_time.slice(0, 5)} start.`,
      });
    }
  }

  const resolutionSuggestions: any[] = [];
  if (conflicts.length > 0) {
    const { data: optionalStops } = await admin
      .from("events")
      .select("id, name")
      .eq("trip_id", tripId)
      .eq("planning_status", "optional")
      .eq("is_skipped", false);
    for (const s of optionalStops ?? []) resolutionSuggestions.push({ type: "swap_optional", eventId: s.id, name: s.name });

    const laterLowPriority = after.find((s) => s.priority === "low" && s.id !== target.id);
    if (laterLowPriority) resolutionSuggestions.push({ type: "drop_candidate", eventId: laterLowPriority.id, name: laterLowPriority.name });
  }

  const mode = body.mode === "skip" ? "skip" : "delete";
  const summary = `${mode === "skip" ? "Skip" : "Remove"} "${target.name}" on ${target.day}${conflicts.length ? ` — ${conflicts.length} conflict(s) found` : ""}.`;

  return {
    proposed_changes: { flow: "remove_stop", day: target.day, deletes: [{ event_id: target.id, mode }], conflicts, resolutionSuggestions, summary },
    day: target.day,
    conflicts,
    resolutionSuggestions,
    summary,
  };
}

// ------------------------------------------------------------- Flow 3

async function flowEditTime(admin: SupabaseClient, tripId: string, body: any) {
  const { data: target } = await admin.from("events").select("*").eq("id", body.eventId).single();
  if (!target) return { error: "Stop not found." };
  if (target.is_derived) return { error: "Can't directly retime a derived transit/check-in/check-out event — edit one of its endpoint stops instead." };

  const { data: categories } = await admin.from("categories").select("*").eq("trip_id", tripId);
  const accommodation = isAccommodation(target, categories!);
  const dayChanged = body.newDay && body.newDay !== target.day;
  if (accommodation && (dayChanged || body.newStartTime) && !body.confirmAccommodationChange) {
    return { error: "Changing an accommodation stop's own booking details needs a separate, explicit confirmation (confirmAccommodationChange)." };
  }

  const newDay = body.newDay ?? target.day;
  const newStartTime: string | null = body.newStartTime ? `${body.newStartTime}:00` : target.start_time;
  const conflicts: any[] = [];

  if (!accommodation && newDay && newStartTime) {
    const categoryName = categories!.find((c: any) => c.id === target.category_id)?.name;
    if (target.opening_hours) {
      const window = legalStartWindow(target.opening_hours, newDay, target.visit_duration_minutes, categoryName === "meal", target.kitchen_closing_time);
      const startMinutes = timeToMinutes(newStartTime);
      if (window.earliest && startMinutes < timeToMinutes(window.earliest)) {
        conflicts.push({ kind: "opening_hours", message: `Opens at ${window.earliest.slice(0, 5)} — earlier than the proposed time.` });
      }
      if (window.latest && startMinutes > timeToMinutes(window.latest)) {
        conflicts.push({ kind: "opening_hours", message: `Latest legal start is ${window.latest.slice(0, 5)} — the proposed time is later than that.` });
      }
    }

    const { data: allStops } = await admin.from("events").select("*").eq("trip_id", tripId);
    const sequence = buildDaySequence(newDay, allStops ?? [], categories!).filter((s) => s.id !== target.id);
    const neighbor = [...sequence].reverse().find((s) => s.start_time && s.start_time < newStartTime);
    if (neighbor?.maps_place_id && target.maps_place_id) {
      const travelMinutes = await getTravelEstimate(admin, tripId, neighbor.maps_place_id, target.maps_place_id);
      if (travelMinutes != null) {
        const departure = neighbor.end_time ?? fallbackEndTime(neighbor.start_time);
        const arrival = shiftTime(departure, travelMinutes);
        if (timeToMinutes(arrival) > timeToMinutes(newStartTime)) {
          conflicts.push({ kind: "insufficient_travel_time", message: `Only ${travelMinutes} min is available from "${neighbor.name}" — not enough to arrive by the new time.` });
        }
      }
    }
  }

  const changes: Record<string, unknown> = {};
  if (dayChanged) changes.day = newDay;
  if (body.newStartTime) {
    changes.start_time = newStartTime;
    changes.end_time = target.visit_duration_minutes ? shiftTime(newStartTime!, target.visit_duration_minutes) : null;
  }

  const summary = `Move "${target.name}" to ${newStartTime?.slice(0, 5) ?? "no time"}${dayChanged ? ` on ${newDay}` : ""}.`;

  return {
    proposed_changes: {
      flow: "edit_time",
      day: newDay,
      updates: [{ event_id: target.id, changes, old: { day: target.day, start_time: target.start_time, end_time: target.end_time } }],
      conflicts,
      summary,
    },
    day: newDay,
    conflicts,
    summary,
  };
}

// --------------------------------------------------------------- server

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST only" }), { status: 405 });

  const authHeader = req.headers.get("Authorization") ?? "";
  const body = await req.json();
  const { tripId, action } = body;
  if (!tripId || !action) return new Response(JSON.stringify({ error: "tripId and action required" }), { status: 400 });

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "unauthenticated" }), { status: 401 });

  const { data: member } = await userClient.from("trip_members").select("role").eq("trip_id", tripId).single();
  if (!member || !["admin", "editor"].includes(member.role)) {
    return new Response(JSON.stringify({ error: "not authorized to edit this trip" }), { status: 403 });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  let result: any;
  try {
    if (action === "add_stop") result = await flowAddStop(admin, tripId, user.id, body);
    else if (action === "remove_stop") result = await flowRemoveStop(admin, tripId, body);
    else if (action === "edit_time") result = await flowEditTime(admin, tripId, body);
    else return new Response(JSON.stringify({ error: "unknown action" }), { status: 400 });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }

  if (result.error) return new Response(JSON.stringify({ error: result.error }), { status: 422 });

  const { data: preview, error } = await admin
    .from("ai_previews")
    .insert({ trip_id: tripId, day: result.day, proposed_changes: result.proposed_changes, created_by: user.id })
    .select()
    .single();
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  return new Response(JSON.stringify({ preview, conflicts: result.conflicts, summary: result.summary, resolutionSuggestions: result.resolutionSuggestions }), {
    headers: { "Content-Type": "application/json" },
  });
});
