// §5/§6/§7/§8: (re)generates a single day's derived transit/check-in/check-out
// events and returns any scheduling conflicts found.
//
// Runs server-side (not in the browser) because `events` RLS only allows
// authenticated clients to write is_derived = false rows (supabase/migrations
// /20260805000001_rls_policies.sql) — derived rows are only ever written by
// a trusted service_role path, by design, so this function does that write
// after itself verifying the caller is actually an admin/editor of the trip.
//
// Behaviorally identical to app/src/lib/itinerary-engine.ts's day-sequencing
// and timing rules, but a separate implementation — client and this edge
// function don't share a module system (same reasoning as §1's timezone
// logic needing one implementation per runtime).

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const GOOGLE_MAPS_SERVER_KEY = Deno.env.get("GOOGLE_MAPS_SERVER_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type EventRow = Record<string, any>;

interface Conflict {
  kind: "checkin_window" | "checkout_deadline" | "opening_hours" | "insufficient_travel_time";
  eventId: string;
  message: string;
}

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

function shiftDay(day: string, deltaDays: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function weekdayOf(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function legalStartWindow({
  openingHours,
  day,
  visitDurationMinutes,
  isFoodService,
  kitchenClosingTime,
}: {
  openingHours: Record<string, { open: string; close: string }> | null;
  day: string | null;
  visitDurationMinutes: number | null;
  isFoodService: boolean;
  kitchenClosingTime: string | null;
}): { earliest: string | null; latest: string | null } {
  if (!openingHours || !day) return { earliest: null, latest: null };
  const hours = openingHours[String(weekdayOf(day))];
  if (!hours) return { earliest: null, latest: null };
  const closing = isFoodService ? kitchenClosingTime ?? shiftTime(hours.close, -60) : hours.close;
  const latest = visitDurationMinutes != null ? shiftTime(closing, -visitDurationMinutes) : null;
  return { earliest: hours.open, latest };
}

function isAccommodation(stop: EventRow, categories: EventRow[]): boolean {
  return categories.find((c) => c.id === stop.category_id)?.name === "accommodation";
}

function buildDaySequence(day: string, allStops: EventRow[], categories: EventRow[]): EventRow[] {
  const accommodations = allStops.filter(
    (s) => !s.is_derived && !s.is_skipped && s.planning_status === "planned" && isAccommodation(s, categories),
  );
  const prevAccommodation = accommodations.find((s) => s.day === shiftDay(day, -1)) ?? null;
  const nextAccommodation = accommodations.find((s) => s.day === day) ?? null;

  const middle = allStops
    .filter(
      (s) =>
        !s.is_derived &&
        !s.is_skipped &&
        s.planning_status === "planned" &&
        s.day === day &&
        !isAccommodation(s, categories) &&
        s.start_time,
    )
    .sort((a, b) => a.start_time.localeCompare(b.start_time));

  return [prevAccommodation, ...middle, nextAccommodation].filter((s): s is EventRow => !!s);
}

// Same shape as maps-directions: per-trip override wins, then the shared cache, then Google.
async function getTravelEstimate(
  admin: SupabaseClient,
  tripId: string,
  originPlaceId: string,
  destinationPlaceId: string,
): Promise<{ durationSeconds: number; distanceMeters: number } | null> {
  const { data: override } = await admin
    .from("travel_mode_overrides")
    .select("mode")
    .eq("trip_id", tripId)
    .or(
      `and(place_id_a.eq.${originPlaceId},place_id_b.eq.${destinationPlaceId}),and(place_id_a.eq.${destinationPlaceId},place_id_b.eq.${originPlaceId})`,
    )
    .maybeSingle();
  const mode = override?.mode ?? "driving";

  const { data: cached } = await admin
    .from("travel_time_cache")
    .select("duration_seconds, distance_meters")
    .eq("origin_place_id", originPlaceId)
    .eq("destination_place_id", destinationPlaceId)
    .eq("mode", mode)
    .maybeSingle();
  if (cached) return { durationSeconds: cached.duration_seconds, distanceMeters: cached.distance_meters };

  const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
  url.searchParams.set("origin", `place_id:${originPlaceId}`);
  url.searchParams.set("destination", `place_id:${destinationPlaceId}`);
  url.searchParams.set("mode", mode);
  url.searchParams.set("key", GOOGLE_MAPS_SERVER_KEY);
  const res = await fetch(url);
  const json = await res.json();
  if (json.status !== "OK" || !json.routes?.[0]?.legs?.[0]) return null;

  const leg = json.routes[0].legs[0];
  const durationSeconds = leg.duration.value;
  const distanceMeters = leg.distance.value;
  await admin.from("travel_time_cache").upsert({
    origin_place_id: originPlaceId,
    destination_place_id: destinationPlaceId,
    mode,
    duration_seconds: durationSeconds,
    distance_meters: distanceMeters,
    fetched_at: new Date().toISOString(),
  });
  return { durationSeconds, distanceMeters };
}

async function upsertDerivedEvent(admin: SupabaseClient, existing: EventRow | undefined, fields: EventRow): Promise<string> {
  if (existing) {
    const { error } = await admin.from("events").update(fields).eq("id", existing.id);
    if (error) throw error;
    return existing.id;
  }
  const { data, error } = await admin
    .from("events")
    .insert({ ...fields, is_derived: true, planning_status: null, is_skipped: false })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function recalculateDay(admin: SupabaseClient, trip: EventRow, allStops: EventRow[], categories: EventRow[], day: string) {
  const conflicts: Conflict[] = [];
  const sequence = buildDaySequence(day, allStops, categories);
  const transportCategory = categories.find((c) => c.name === "transport");
  const existingDerived = allStops.filter((s) => s.is_derived && s.day === day);
  const keepIds = new Set<string>();

  const prevAccommodation =
    sequence[0] && sequence[0].day !== day && isAccommodation(sequence[0], categories) ? sequence[0] : null;
  const lastEntry = sequence[sequence.length - 1];
  const nextAccommodation = lastEntry && lastEntry.day === day && isAccommodation(lastEntry, categories) ? lastEntry : null;

  let checkoutEnd: string | null = null;
  if (prevAccommodation?.checkout_deadline) {
    const firstMiddle = sequence.find((s) => s.id !== prevAccommodation.id && s.id !== nextAccommodation?.id) ?? null;
    let legMinutes: number | null = null;
    if (firstMiddle?.maps_place_id && prevAccommodation.maps_place_id) {
      const estimate = await getTravelEstimate(admin, trip.id, prevAccommodation.maps_place_id, firstMiddle.maps_place_id);
      if (estimate) legMinutes = Math.round(estimate.durationSeconds / 60);
    }
    const requiredDeparture =
      legMinutes != null && firstMiddle?.start_time ? shiftTime(firstMiddle.start_time, -legMinutes) : null;
    checkoutEnd =
      requiredDeparture && timeToMinutes(requiredDeparture) < timeToMinutes(prevAccommodation.checkout_deadline)
        ? requiredDeparture
        : prevAccommodation.checkout_deadline;
    const checkoutStart = shiftTime(checkoutEnd, -15);

    if (legMinutes != null && firstMiddle?.start_time) {
      const arrivalIfAtDeadline = shiftTime(prevAccommodation.checkout_deadline, legMinutes);
      if (timeToMinutes(arrivalIfAtDeadline) > timeToMinutes(firstMiddle.start_time)) {
        conflicts.push({
          kind: "checkout_deadline",
          eventId: prevAccommodation.id,
          message: `Checkout by ${prevAccommodation.checkout_deadline.slice(0, 5)} doesn't leave enough time to reach "${firstMiddle.name}" on time.`,
        });
      }
    }

    const existing = existingDerived.find((e) => e.derived_kind === "checkout" && e.checkout_for_event_id === prevAccommodation.id);
    const id = await upsertDerivedEvent(admin, existing, {
      trip_id: trip.id,
      category_id: prevAccommodation.category_id,
      name: `Check-out ${prevAccommodation.name}`,
      day,
      start_time: checkoutStart,
      end_time: checkoutEnd,
      derived_kind: "checkout",
      checkout_for_event_id: prevAccommodation.id,
    });
    keepIds.add(id);
  } else if (prevAccommodation) {
    const existing = existingDerived.find((e) => e.derived_kind === "checkout" && e.checkout_for_event_id === prevAccommodation.id);
    if (existing) await admin.from("events").delete().eq("id", existing.id);
  }

  let checkinHandled = false;
  for (let i = 0; i < sequence.length - 1; i++) {
    const origin = sequence[i];
    const destination = sequence[i + 1];
    if (!origin.maps_place_id || !destination.maps_place_id) continue;

    const isOriginPrevAccommodation = origin.id === prevAccommodation?.id;
    const originDeparture = isOriginPrevAccommodation
      ? checkoutEnd ?? trip.default_day_start
      : origin.end_time ?? (origin.start_time ? fallbackEndTime(origin.start_time) : trip.default_day_start);

    const estimate = await getTravelEstimate(admin, trip.id, origin.maps_place_id, destination.maps_place_id);
    if (!estimate) continue;
    const durationMinutes = Math.round(estimate.durationSeconds / 60);
    const transitStart = originDeparture;
    const transitEnd = shiftTime(transitStart, durationMinutes);

    const isDestinationNextAccommodation = destination.id === nextAccommodation?.id;
    if (!isDestinationNextAccommodation && destination.start_time && timeToMinutes(transitEnd) > timeToMinutes(destination.start_time)) {
      conflicts.push({
        kind: "insufficient_travel_time",
        eventId: destination.id,
        message: `Not enough travel time before "${destination.name}" at ${destination.start_time.slice(0, 5)} — arriving ~${transitEnd.slice(0, 5)}.`,
      });
    }

    const existing = existingDerived.find(
      (e) => e.derived_kind === "transit" && e.transit_from_event_id === origin.id && e.transit_to_event_id === destination.id,
    );
    const id = await upsertDerivedEvent(admin, existing, {
      trip_id: trip.id,
      category_id: transportCategory?.id,
      name: `Travel to ${destination.name}`,
      day,
      start_time: transitStart,
      end_time: transitEnd,
      derived_kind: "transit",
      transit_from_event_id: origin.id,
      transit_to_event_id: destination.id,
    });
    keepIds.add(id);

    if (isDestinationNextAccommodation && destination.check_in_window_start && destination.check_in_window_end) {
      checkinHandled = true;
      const checkInStart =
        timeToMinutes(transitEnd) > timeToMinutes(destination.check_in_window_start) ? transitEnd : destination.check_in_window_start;
      const checkInEnd = shiftTime(checkInStart, 30);
      if (timeToMinutes(checkInEnd) > timeToMinutes(destination.check_in_window_end)) {
        conflicts.push({
          kind: "checkin_window",
          eventId: destination.id,
          message: `Arrival around ${transitEnd.slice(0, 5)} doesn't leave time to check in before ${destination.check_in_window_end.slice(0, 5)}.`,
        });
      }
      const existingCheckin = existingDerived.find((e) => e.derived_kind === "checkin" && e.checkin_for_event_id === destination.id);
      const checkinId = await upsertDerivedEvent(admin, existingCheckin, {
        trip_id: trip.id,
        category_id: destination.category_id,
        name: `Check-in ${destination.name}`,
        day,
        start_time: checkInStart,
        end_time: checkInEnd,
        derived_kind: "checkin",
        checkin_for_event_id: destination.id,
      });
      keepIds.add(checkinId);
    }
  }

  if (!checkinHandled && nextAccommodation?.check_in_window_start && nextAccommodation?.check_in_window_end) {
    const middleBeforeAccommodation = sequence.slice(0, -1).filter((s) => s.id !== prevAccommodation?.id);
    const lastMiddle = middleBeforeAccommodation[middleBeforeAccommodation.length - 1] ?? null;
    const fallbackArrival = lastMiddle ? lastMiddle.end_time ?? lastMiddle.start_time ?? trip.default_day_start : trip.default_day_start;
    const checkInStart =
      timeToMinutes(fallbackArrival) > timeToMinutes(nextAccommodation.check_in_window_start)
        ? fallbackArrival
        : nextAccommodation.check_in_window_start;
    const checkInEnd = shiftTime(checkInStart, 30);
    if (timeToMinutes(checkInEnd) > timeToMinutes(nextAccommodation.check_in_window_end)) {
      conflicts.push({
        kind: "checkin_window",
        eventId: nextAccommodation.id,
        message: `Arrival doesn't leave time to check in before ${nextAccommodation.check_in_window_end.slice(0, 5)}.`,
      });
    }
    const existingCheckin = existingDerived.find((e) => e.derived_kind === "checkin" && e.checkin_for_event_id === nextAccommodation.id);
    const checkinId = await upsertDerivedEvent(admin, existingCheckin, {
      trip_id: trip.id,
      category_id: nextAccommodation.category_id,
      name: `Check-in ${nextAccommodation.name}`,
      day,
      start_time: checkInStart,
      end_time: checkInEnd,
      derived_kind: "checkin",
      checkin_for_event_id: nextAccommodation.id,
    });
    keepIds.add(checkinId);
  } else if (!checkinHandled && nextAccommodation) {
    const existingCheckin = existingDerived.find((e) => e.derived_kind === "checkin" && e.checkin_for_event_id === nextAccommodation.id);
    if (existingCheckin) await admin.from("events").delete().eq("id", existingCheckin.id);
  }

  for (const stop of sequence) {
    if (isAccommodation(stop, categories) || !stop.opening_hours || !stop.start_time) continue;
    const categoryName = categories.find((c) => c.id === stop.category_id)?.name;
    const window = legalStartWindow({
      openingHours: stop.opening_hours,
      day: stop.day,
      visitDurationMinutes: stop.visit_duration_minutes,
      isFoodService: categoryName === "meal",
      kitchenClosingTime: stop.kitchen_closing_time,
    });
    const startMinutes = timeToMinutes(stop.start_time);
    if (window.earliest && startMinutes < timeToMinutes(window.earliest)) {
      conflicts.push({ kind: "opening_hours", eventId: stop.id, message: `"${stop.name}" starts before it opens (${window.earliest.slice(0, 5)}).` });
    }
    if (window.latest && startMinutes > timeToMinutes(window.latest)) {
      conflicts.push({ kind: "opening_hours", eventId: stop.id, message: `"${stop.name}" starts too late — last legal start is ${window.latest.slice(0, 5)}.` });
    }
  }

  await Promise.all(existingDerived.filter((e) => !keepIds.has(e.id)).map((e) => admin.from("events").delete().eq("id", e.id)));

  return conflicts;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), { status: 405 });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const { tripId, day } = await req.json();
  if (!tripId || !day) {
    return new Response(JSON.stringify({ error: "tripId and day required" }), { status: 400 });
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: member } = await userClient
    .from("trip_members")
    .select("role")
    .eq("trip_id", tripId)
    .single();
  if (!member || !["admin", "editor"].includes(member.role)) {
    return new Response(JSON.stringify({ error: "not authorized to edit this trip" }), { status: 403 });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: trip, error: tripError } = await admin.from("trips").select("*").eq("id", tripId).single();
  if (tripError || !trip) {
    return new Response(JSON.stringify({ error: "trip not found" }), { status: 404 });
  }
  const { data: allStops } = await admin.from("events").select("*").eq("trip_id", tripId);
  const { data: categories } = await admin.from("categories").select("*").eq("trip_id", tripId);

  try {
    const conflicts = await recalculateDay(admin, trip, allStops ?? [], categories ?? [], day);
    return new Response(JSON.stringify({ conflicts }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
