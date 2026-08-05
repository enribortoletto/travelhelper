// §12 flight tracking — runs on a schedule (pg_cron, every ~3h, see
// supabase/migrations/20260810000000_flight_tracking_cron.sql) across every
// event carrying a flight number, scoped to today/tomorrow in its trip's
// own timezone (live data isn't useful or available further out).
//
// Not gated by a user JWT (the caller is Postgres, not a browser) —
// protected by the same shared CRON_SECRET pattern as notification-rules.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const AERODATABOX_API_KEY = Deno.env.get("AERODATABOX_API_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET")!;

/** yyyy-MM-dd "today"/"tomorrow" in a given IANA timezone. */
function todayAndTomorrow(timeZone: string, now: Date): [string, string] {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const today = fmt.format(now);
  const tomorrow = fmt.format(new Date(now.getTime() + 24 * 60 * 60 * 1000));
  return [today, tomorrow];
}

function parseAdbTime(t: string): Date {
  // AeroDataBox format: "2026-08-06 06:35Z" -> ISO-compatible with a "T".
  return new Date(t.replace(" ", "T"));
}

interface Leg {
  scheduledTime?: { utc: string };
  revisedTime?: { utc: string };
  predictedTime?: { utc: string };
}

async function lookupFlight(flightNumber: string, day: string): Promise<any[] | null> {
  const res = await fetch(`https://aerodatabox.p.rapidapi.com/flights/number/${encodeURIComponent(flightNumber)}/${day}`, {
    headers: {
      "X-RapidAPI-Key": AERODATABOX_API_KEY,
      "X-RapidAPI-Host": "aerodatabox.p.rapidapi.com",
    },
  });
  if (!res.ok) return null;
  const json = await res.json();
  return Array.isArray(json) ? json : null;
}

const CANCELLED_DIVERTED = new Set(["cancelled", "canceled", "diverted"]);

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: events } = await admin
    .from("events")
    .select("id, day, flight_number, flight_leg, start_time, delay_minutes, start_time_label, trip_id, trips(timezone)")
    .not("flight_number", "is", null);

  const now = new Date();
  let checked = 0;
  let updated = 0;

  for (const event of events ?? []) {
    const timezone = (event as any).trips?.timezone;
    if (!timezone || !event.day) continue;

    const [today, tomorrow] = todayAndTomorrow(timezone, now);
    if (event.day !== today && event.day !== tomorrow) continue;

    checked++;
    const matches = await lookupFlight(event.flight_number, event.day);
    if (!matches || matches.length === 0) continue;

    // If multiple matches for the same flight number, pick the one whose
    // scheduled time for the leg of interest falls on the expected day.
    const legKey = event.flight_leg === "arrival" ? "arrival" : "departure";
    const match =
      matches.find((m) => {
        const leg: Leg | undefined = m[legKey];
        if (!leg?.scheduledTime?.utc) return false;
        return parseAdbTime(leg.scheduledTime.utc).toISOString().slice(0, 10) === event.day;
      }) ?? matches[0];

    const leg: Leg | undefined = match[legKey];
    if (!leg?.scheduledTime?.utc) continue;

    const scheduled = parseAdbTime(leg.scheduledTime.utc);
    const revisedIso = leg.revisedTime?.utc ?? leg.predictedTime?.utc;
    const delayMinutes = revisedIso ? Math.max(0, Math.round((parseAdbTime(revisedIso).getTime() - scheduled.getTime()) / 60000)) : 0;

    const status = String(match.status ?? "").toLowerCase();
    const label = CANCELLED_DIVERTED.has(status) ? (status === "diverted" ? "Diverted" : "Cancelled") : null;

    const fields: Record<string, unknown> = {};
    if (delayMinutes !== event.delay_minutes) fields.delay_minutes = delayMinutes;
    if (label !== null && label !== event.start_time_label) fields.start_time_label = label;

    if (Object.keys(fields).length > 0) {
      await admin.from("events").update(fields).eq("id", event.id);
      updated++;
    }
  }

  return new Response(JSON.stringify({ checked, updated }), { headers: { "Content-Type": "application/json" } });
});
