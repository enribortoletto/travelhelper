// §11 push notification rules — runs on a schedule (pg_cron, every ~5 min,
// see supabase/migrations/20260809000000_notification_cron.sql) across
// every (user, trip) with an active push subscription.
//
// Not gated by a normal user JWT (the caller is Postgres, not a browser) —
// protected instead by a shared CRON_SECRET header, checked below.

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GOOGLE_MAPS_SERVER_KEY = Deno.env.get("GOOGLE_MAPS_SERVER_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT")!;

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const REMINDER_MINUTES_BEFORE = 30;
const SHORT_DELAY_THRESHOLD = 5;
const LONG_DELAY_THRESHOLD = 30;
const VARIATION_ABSOLUTE_MINUTES = 10;
const VARIATION_RELATIVE = 0.25;

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** Current wall-clock minutes-of-day and yyyy-MM-dd in a given IANA timezone. */
function nowInZone(timeZone: string, now: Date): { today: string; minutes: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  return {
    today: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

function inQuietHours(nowMinutes: number, start: string, end: string): boolean {
  const s = timeToMinutes(start);
  const e = timeToMinutes(end);
  if (s === e) return false;
  if (s < e) return nowMinutes >= s && nowMinutes < e; // same-day window
  return nowMinutes >= s || nowMinutes < e; // crosses midnight
}

/** Fresh (uncached) live estimate — §11 rules 3-5 need a *live* re-query, not §6's shared planning cache. */
async function getLiveEstimate(originPlaceId: string, destinationPlaceId: string): Promise<number | null> {
  const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
  url.searchParams.set("origin", `place_id:${originPlaceId}`);
  url.searchParams.set("destination", `place_id:${destinationPlaceId}`);
  url.searchParams.set("mode", "driving");
  url.searchParams.set("key", GOOGLE_MAPS_SERVER_KEY);
  const res = await fetch(url);
  const json = await res.json();
  if (json.status !== "OK" || !json.routes?.[0]?.legs?.[0]) return null;
  return Math.round(json.routes[0].legs[0].duration.value / 60);
}

/**
 * Claim-then-send: insert into notification_log first (unique constraint
 * dedups across overlapping/concurrent runs), only actually push if the
 * insert wasn't rejected as a duplicate.
 */
async function claimAndSend(
  admin: SupabaseClient,
  row: { user_id: string; trip_id: string; notification_type: string; event_id: string | null; day: string | null; title: string; body: string },
  subscription: webpush.PushSubscription,
): Promise<void> {
  const { error } = await admin.from("notification_log").insert(row);
  if (error) {
    if (error.code === "23505") return; // already sent — duplicate claim, nothing to do
    throw error;
  }

  try {
    await webpush.sendNotification(subscription, JSON.stringify({ title: row.title, body: row.body }));
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number }).statusCode;
    if (statusCode === 404 || statusCode === 410) {
      // Subscription is gone — stop trying to use it.
      await admin.from("user_settings").update({ push_subscription: null }).eq("user_id", row.user_id).eq("trip_id", row.trip_id);
    }
  }
}

async function evaluateForUserTrip(admin: SupabaseClient, settings: Record<string, any>, now: Date) {
  const { data: trip } = await admin.from("trips").select("*").eq("id", settings.trip_id).single();
  if (!trip) return;

  const { today, minutes: nowMinutes } = nowInZone(trip.timezone, now);
  if (inQuietHours(nowMinutes, settings.quiet_hours_start, settings.quiet_hours_end)) return;

  const prefs = settings.notification_prefs ?? {};
  const enabled = (rule: string) => prefs[rule] !== false;
  const subscription = settings.push_subscription as webpush.PushSubscription;

  const { data: stops } = await admin
    .from("events")
    .select("*")
    .eq("trip_id", trip.id)
    .eq("day", today)
    .eq("is_skipped", false);
  const plannedStops = (stops ?? []).filter((s: any) => !s.is_derived && s.planning_status === "planned");

  // Rule 1: daily recap.
  if (enabled("recap") && nowMinutes >= timeToMinutes(settings.daily_recap_time)) {
    const timed = plannedStops.filter((s: any) => s.start_time).sort((a: any, b: any) => a.start_time.localeCompare(b.start_time));
    if (timed.length > 0) {
      const summary = timed.map((s: any) => `${s.start_time.slice(0, 5)} ${s.name}`).join(", ");
      await claimAndSend(
        admin,
        {
          user_id: settings.user_id,
          trip_id: trip.id,
          notification_type: "recap",
          event_id: null,
          day: today,
          title: `Today: ${trip.name}`,
          body: summary,
        },
        subscription,
      );
    }
  }

  // Rule 2: reminder before a stop starts.
  if (enabled("reminder_before_start")) {
    for (const stop of plannedStops) {
      if (!stop.start_time) continue;
      const startMinutes = timeToMinutes(stop.start_time);
      if (nowMinutes >= startMinutes - REMINDER_MINUTES_BEFORE && nowMinutes < startMinutes) {
        await claimAndSend(
          admin,
          {
            user_id: settings.user_id,
            trip_id: trip.id,
            notification_type: "reminder_before_start",
            event_id: stop.id,
            day: today,
            title: stop.name,
            body: `Starts at ${stop.start_time.slice(0, 5)}`,
          },
          subscription,
        );
      }
    }
  }

  // Rules 3-4: delay on the currently in-progress transit leg.
  const transitEvents = (stops ?? []).filter((s: any) => s.is_derived && s.derived_kind === "transit" && s.start_time && s.end_time);
  const inProgressTransit = transitEvents.find(
    (t: any) => nowMinutes >= timeToMinutes(t.start_time) && nowMinutes <= timeToMinutes(t.end_time),
  );
  if (inProgressTransit) {
    const [{ data: origin }, { data: destination }] = await Promise.all([
      admin.from("events").select("maps_place_id").eq("id", inProgressTransit.transit_from_event_id).single(),
      admin.from("events").select("maps_place_id").eq("id", inProgressTransit.transit_to_event_id).single(),
    ]);
    if (origin?.maps_place_id && destination?.maps_place_id) {
      const liveMinutes = await getLiveEstimate(origin.maps_place_id, destination.maps_place_id);
      if (liveMinutes != null) {
        const liveArrival = timeToMinutes(inProgressTransit.start_time) + liveMinutes;
        const gap = liveArrival - timeToMinutes(inProgressTransit.end_time);
        if (gap >= LONG_DELAY_THRESHOLD && enabled("long_delay")) {
          await claimAndSend(
            admin,
            {
              user_id: settings.user_id,
              trip_id: trip.id,
              notification_type: "long_delay",
              event_id: inProgressTransit.id,
              day: today,
              title: "Significant delay",
              body: `${inProgressTransit.name} is running about ${gap} min late.`,
            },
            subscription,
          );
        } else if (gap >= SHORT_DELAY_THRESHOLD && enabled("short_delay")) {
          await claimAndSend(
            admin,
            {
              user_id: settings.user_id,
              trip_id: trip.id,
              notification_type: "short_delay",
              event_id: inProgressTransit.id,
              day: today,
              title: "Running a bit late",
              body: `${inProgressTransit.name} is running about ${gap} min late.`,
            },
            subscription,
          );
        }
      }
    }
  }

  // Rule 5: travel-time variation on the next upcoming leg (not yet in progress).
  if (enabled("travel_time_variation")) {
    const nextTransit = transitEvents
      .filter((t: any) => timeToMinutes(t.start_time) > nowMinutes)
      .sort((a: any, b: any) => a.start_time.localeCompare(b.start_time))[0];
    if (nextTransit) {
      const [{ data: origin }, { data: destination }] = await Promise.all([
        admin.from("events").select("maps_place_id").eq("id", nextTransit.transit_from_event_id).single(),
        admin.from("events").select("maps_place_id").eq("id", nextTransit.transit_to_event_id).single(),
      ]);
      if (origin?.maps_place_id && destination?.maps_place_id) {
        const liveMinutes = await getLiveEstimate(origin.maps_place_id, destination.maps_place_id);
        if (liveMinutes != null) {
          const { data: baseline } = await admin
            .from("event_travel_baseline")
            .select("*")
            .eq("from_event_id", nextTransit.transit_from_event_id)
            .eq("to_event_id", nextTransit.transit_to_event_id)
            .maybeSingle();

          if (!baseline) {
            await admin.from("event_travel_baseline").insert({
              trip_id: trip.id,
              from_event_id: nextTransit.transit_from_event_id,
              to_event_id: nextTransit.transit_to_event_id,
              baseline_minutes: liveMinutes,
            });
          } else {
            const deviation = liveMinutes - baseline.baseline_minutes;
            if (deviation >= VARIATION_ABSOLUTE_MINUTES && deviation >= baseline.baseline_minutes * VARIATION_RELATIVE) {
              await claimAndSend(
                admin,
                {
                  user_id: settings.user_id,
                  trip_id: trip.id,
                  notification_type: "travel_time_variation",
                  event_id: nextTransit.id,
                  day: today,
                  title: "Travel time changed",
                  body: `${nextTransit.name} now looks like ${liveMinutes} min, vs. ${baseline.baseline_minutes} min planned.`,
                },
                subscription,
              );
            }
          }
        }
      }
    }
  }
}

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: subscribedSettings } = await admin.from("user_settings").select("*").not("push_subscription", "is", null);

  const now = new Date();
  const results = await Promise.allSettled((subscribedSettings ?? []).map((s) => evaluateForUserTrip(admin, s, now)));
  const failures = results.filter((r) => r.status === "rejected");

  return new Response(JSON.stringify({ evaluated: results.length, failures: failures.length }), {
    headers: { "Content-Type": "application/json" },
  });
});
