// Job periodico per le notifiche push (05-notification-rules.md).
// Va invocato ogni ~5 minuti da un Cron Job di Supabase (dashboard →
// Integrations → Cron Jobs → "Supabase Edge Functions" come trigger).
//
// A differenza di ics-feed, QUESTA funzione resta protetta da JWT: deve
// essere invocabile solo dal Cron Job del progetto, non pubblicamente
// (invierebbe notifiche push reali).
//
// Regole implementate (tutte deduplicate via notification_log, tutte
// silenziate durante l'orario di silenzio dell'utente):
//   1. Recap giornaliero
//   2. Promemoria 30 minuti prima
//   3. Ritardo 5 minuti (+ tempo di guida ricalcolato verso la prossima tappa)
//   4. Ritardo 30 minuti (stessa logica, soglia diversa, messaggio più netto)
//   5. Variazione significativa del tempo di percorrenza vs stima originale
//
// RUN_WINDOW_MINUTES deve combaciare (o essere >=) con la cadenza del Cron
// Job: è la tolleranza usata per "now coincide con l'orario X".

import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const RUN_WINDOW_MINUTES = 5;
const REMINDER_MINUTES_BEFORE = 30;
const DELAY_THRESHOLD_1_MIN = 5;
const DELAY_THRESHOLD_2_MIN = 30;
const TRAVEL_VARIATION_MIN_MINUTES = 10; // scostamento minimo assoluto per notificare
const TRAVEL_VARIATION_RATIO = 0.25; // oppure il 25% in più rispetto alla baseline

interface EventRow {
  id: string;
  trip_id: string;
  day: string;
  name: string;
  category: string;
  status_plan: string;
  start_time: string | null;
  end_time: string | null;
  maps_place_id: string | null;
  is_skipped: boolean;
}

interface WebPushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

interface NotificationPrefs {
  recap: boolean;
  promemoria_30: boolean;
  ritardo_5: boolean;
  ritardo_30: boolean;
  variazione_percorrenza: boolean;
}

interface UserSettingsRow {
  user_id: string;
  trip_id: string;
  daily_recap_time: string;
  quiet_hours_start: string;
  quiet_hours_end: string;
  push_subscription: WebPushSubscription | null;
  notification_prefs: NotificationPrefs;
}

// ---------- utilità tempo (Europe/London, dove cade l'intero viaggio) ----------

function londonParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hm: `${get("hour")}:${get("minute")}`,
  };
}

function hmToMinutes(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

function isWithinQuietHours(nowHm: string, start: string, end: string): boolean {
  const now = hmToMinutes(nowHm);
  const s = hmToMinutes(start.slice(0, 5));
  const e = hmToMinutes(end.slice(0, 5));
  if (s === e) return false;
  if (s < e) return now >= s && now < e;
  return now >= s || now < e; // finestra che attraversa la mezzanotte (es. 22:00-08:00)
}

// true se `target` cade nella finestra [now - windowMin, now)
function justPassed(nowMin: number, targetMin: number, windowMin: number): boolean {
  const diff = nowMin - targetMin;
  return diff >= 0 && diff < windowMin;
}

// ---------- Directions API (server-side, chiave separata senza restrizione referrer) ----------

async function fetchDrivingMinutes(
  originPlaceId: string,
  destinationPlaceId: string,
  apiKey: string,
): Promise<number | null> {
  const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
  url.searchParams.set("origin", `place_id:${originPlaceId}`);
  url.searchParams.set("destination", `place_id:${destinationPlaceId}`);
  url.searchParams.set("mode", "driving");
  url.searchParams.set("key", apiKey);

  const res = await fetch(url);
  const data = await res.json();
  const seconds = data?.routes?.[0]?.legs?.[0]?.duration?.value;
  return typeof seconds === "number" ? Math.round(seconds / 60) : null;
}

// ---------- notification_log: dedup "atomico" via insert + unique index ----------

async function claim(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  row: {
    trip_id: string;
    user_id: string;
    notification_type: string;
    event_id?: string;
    day?: string;
  },
): Promise<boolean> {
  const { error } = await supabase.from("notification_log").insert(row);
  if (!error) return true;
  if (error.code === "23505") return false; // già inviata
  console.error("claim insert error", error);
  return false;
}

// ---------- push ----------

async function sendPush(
  subscription: WebPushSubscription,
  payload: { title: string; body: string; tag?: string; url?: string },
  vapid: { publicKey: string; privateKey: string; subject: string },
) {
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
  await webpush.sendNotification(
    subscription as unknown as webpush.PushSubscription,
    JSON.stringify(payload),
  );
}

Deno.serve(async (req) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const directionsApiKey = Deno.env.get("GOOGLE_MAPS_SERVER_KEY");
  const vapid = {
    publicKey: Deno.env.get("VAPID_PUBLIC_KEY")!,
    privateKey: Deno.env.get("VAPID_PRIVATE_KEY")!,
    subject: Deno.env.get("VAPID_SUBJECT")!, // es. "mailto:tu@esempio.com"
  };

  const now = new Date();
  const { date: today, hm: nowHm } = londonParts(now);
  const nowMin = hmToMinutes(nowHm);

  const { data: settingsRows, error: settingsError } = await supabase
    .from("user_settings")
    .select("*")
    .not("push_subscription", "is", null);
  if (settingsError) {
    return new Response(`settings query error: ${settingsError.message}`, { status: 500 });
  }

  const results: string[] = [];

  for (const settings of (settingsRows ?? []) as UserSettingsRow[]) {
    if (isWithinQuietHours(nowHm, settings.quiet_hours_start, settings.quiet_hours_end)) {
      continue;
    }

    const { data: memberRow } = await supabase
      .from("trip_members")
      .select("display_name")
      .eq("user_id", settings.user_id)
      .eq("trip_id", settings.trip_id)
      .maybeSingle();
    const displayName = memberRow?.display_name ?? "";

    const { data: dayEventsRaw } = await supabase
      .from("events")
      .select(
        "id, trip_id, day, name, category, status_plan, start_time, end_time, maps_place_id, is_skipped",
      )
      .eq("trip_id", settings.trip_id)
      .eq("status_plan", "nel_piano")
      .eq("day", today)
      .order("start_time", { ascending: true, nullsFirst: false });

    const dayEvents = (dayEventsRaw ?? []) as EventRow[];
    const push = (payload: { title: string; body: string; tag?: string; url?: string }) =>
      sendPush(settings.push_subscription!, payload, vapid).catch((err) =>
        console.error("push send error", settings.user_id, err),
      );
    const prefs: NotificationPrefs = settings.notification_prefs ?? {
      recap: true,
      promemoria_30: true,
      ritardo_5: true,
      ritardo_30: true,
      variazione_percorrenza: true,
    };

    // ---- Regola 1: recap giornaliero ----
    const recapMin = hmToMinutes(settings.daily_recap_time.slice(0, 5));
    if (prefs.recap && justPassed(nowMin, recapMin, RUN_WINDOW_MINUTES)) {
      const claimed = await claim(supabase, {
        trip_id: settings.trip_id,
        user_id: settings.user_id,
        notification_type: "recap",
        day: today,
      });
      if (claimed) {
        const lines = dayEvents
          .filter((e) => e.start_time)
          .map((e) => `${e.start_time!.slice(0, 5)} ${e.name}`);
        await push({
          title: `Recap di oggi${displayName ? `, ${displayName}` : ""}`,
          body: lines.length > 0 ? lines.join("\n") : "Nessun evento fissato per oggi.",
          tag: `recap-${today}`,
        });
        results.push(`recap:${settings.user_id}`);
      }
    }

    // ---- Regola 2: promemoria 30 min prima ----
    for (const event of prefs.promemoria_30 ? dayEvents : []) {
      if (!event.start_time) continue;
      const startMin = hmToMinutes(event.start_time.slice(0, 5));
      const reminderMin = startMin - REMINDER_MINUTES_BEFORE;
      if (!justPassed(nowMin, reminderMin, RUN_WINDOW_MINUTES)) continue;

      const claimed = await claim(supabase, {
        trip_id: settings.trip_id,
        user_id: settings.user_id,
        notification_type: "promemoria_30",
        event_id: event.id,
      });
      if (claimed) {
        await push({
          title: "Tra 30 minuti",
          body: `${event.name} alle ${event.start_time.slice(0, 5)}`,
          tag: `promemoria-${event.id}`,
        });
        results.push(`promemoria:${event.id}`);
      }
    }

    // ---- Regole 3-4: ritardo su un evento "in corso" ----
    for (const event of dayEvents) {
      if (!event.start_time || event.is_skipped) continue;
      const startMin = hmToMinutes(event.start_time.slice(0, 5));
      const endMin = event.end_time ? hmToMinutes(event.end_time.slice(0, 5)) : startMin + 60;
      if (nowMin < startMin || nowMin > endMin) continue; // non è "in corso" adesso

      const lateBy = nowMin - startMin;
      const nextEvent = dayEvents.find(
        (e) => e.start_time && hmToMinutes(e.start_time.slice(0, 5)) > startMin,
      );

      let travelNote = "";
      if (directionsApiKey && event.maps_place_id && nextEvent?.maps_place_id) {
        const minutes = await fetchDrivingMinutes(
          event.maps_place_id,
          nextEvent.maps_place_id,
          directionsApiKey,
        );
        if (minutes !== null) {
          travelNote = ` — ${minutes} min di guida fino a ${nextEvent.name}`;
        }
      }

      if (lateBy >= DELAY_THRESHOLD_2_MIN && prefs.ritardo_30) {
        const claimed = await claim(supabase, {
          trip_id: settings.trip_id,
          user_id: settings.user_id,
          notification_type: "ritardo_30",
          event_id: event.id,
        });
        if (claimed) {
          await push({
            title: `In ritardo di ${lateBy} minuti`,
            body: `${event.name}${travelNote}. Vale la pena ricalcolare la giornata dall'assistente.`,
            tag: `ritardo30-${event.id}`,
          });
          results.push(`ritardo30:${event.id}`);
        }
      } else if (lateBy >= DELAY_THRESHOLD_1_MIN && prefs.ritardo_5) {
        const claimed = await claim(supabase, {
          trip_id: settings.trip_id,
          user_id: settings.user_id,
          notification_type: "ritardo_5",
          event_id: event.id,
        });
        if (claimed) {
          await push({
            title: `Piccolo ritardo su ${event.name}`,
            body: `${lateBy} minuti dopo l'orario previsto${travelNote}.`,
            tag: `ritardo5-${event.id}`,
          });
          results.push(`ritardo5:${event.id}`);
        }
      }
    }

    // ---- Regola 5: variazione tempo di percorrenza vs stima originale ----
    if (directionsApiKey && prefs.variazione_percorrenza) {
      const upcoming = dayEvents.filter((e) => e.start_time && hmToMinutes(e.start_time.slice(0, 5)) > nowMin);
      const next = upcoming[0];
      const prevIndex = next ? dayEvents.indexOf(next) - 1 : -1;
      const prev = prevIndex >= 0 ? dayEvents[prevIndex] : null;

      if (next?.maps_place_id && prev?.maps_place_id) {
        const currentMinutes = await fetchDrivingMinutes(
          prev.maps_place_id,
          next.maps_place_id,
          directionsApiKey,
        );

        if (currentMinutes !== null) {
          const { data: baseline } = await supabase
            .from("event_travel_baseline")
            .select("baseline_minutes")
            .eq("from_event_id", prev.id)
            .eq("to_event_id", next.id)
            .maybeSingle();

          if (!baseline) {
            await supabase.from("event_travel_baseline").insert({
              trip_id: settings.trip_id,
              from_event_id: prev.id,
              to_event_id: next.id,
              baseline_minutes: currentMinutes,
            });
          } else {
            const delta = currentMinutes - baseline.baseline_minutes;
            const significant =
              delta >= TRAVEL_VARIATION_MIN_MINUTES &&
              delta >= baseline.baseline_minutes * TRAVEL_VARIATION_RATIO;

            if (significant) {
              const claimed = await claim(supabase, {
                trip_id: settings.trip_id,
                user_id: settings.user_id,
                notification_type: "variazione_percorrenza",
                event_id: next.id,
              });
              if (claimed) {
                await push({
                  title: "Traffico sul prossimo spostamento",
                  body: `${prev.name} → ${next.name}: ora ${currentMinutes} min (stimati inizialmente ${baseline.baseline_minutes} min).`,
                  tag: `traffico-${next.id}`,
                });
                results.push(`traffico:${next.id}`);
              }
            }
          }
        }
      }
    }
  }

  return new Response(JSON.stringify({ sent: results }), {
    headers: { "Content-Type": "application/json" },
  });
});
