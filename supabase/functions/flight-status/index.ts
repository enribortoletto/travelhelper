// Job periodico per lo stato reale dei voli (AeroDataBox via RapidAPI).
// Va invocato periodicamente da un Cron Job di Supabase (dashboard →
// Integrations → Cron Jobs → "Supabase Edge Functions" come trigger),
// es. ogni 3 ore — non serve più frequente: i dati "live" di AeroDataBox
// sono comunque disponibili solo a ridosso del volo, e il piano free ha un
// limite di richieste mensili da non sprecare.
//
// Aggiorna solo gli eventi con flight_number valorizzato (vedi migration
// flight_tracking) il cui giorno (fuso Europe/London) è oggi o domani —
// fuori da questa finestra il volo resta con l'orario/etichetta inseriti
// manualmente. Scrive il ritardo/stato sulle colonne già esistenti
// (delay_minutes, start_time_label): sono le stesse già mostrate ovunque
// nell'app per "In ritardo", quindi non serve nessun componente UI nuovo —
// il client riceve l'aggiornamento via la sottoscrizione realtime già
// presente in useEvents.
//
// Richiede il secret AERODATABOX_RAPIDAPI_KEY (Project Settings → Edge
// Functions → Secrets, o `supabase secrets set AERODATABOX_RAPIDAPI_KEY=...`).

import { createClient } from "jsr:@supabase/supabase-js@2";

const RAPIDAPI_HOST = "aerodatabox.p.rapidapi.com";

interface TrackedFlightEvent {
  id: string;
  day: string;
  flight_number: string;
  flight_leg: "departure" | "arrival";
}

interface DateTimeContract {
  utc: string;
  local: string;
}

interface FlightAirportMovement {
  scheduledTime?: DateTimeContract;
  revisedTime?: DateTimeContract;
  predictedTime?: DateTimeContract;
}

interface FlightContract {
  number: string;
  status: string;
  departure: FlightAirportMovement;
  arrival: FlightAirportMovement;
}

function londonDay(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function addDaysIso(day: string, delta: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function minutesBetween(laterIso: string, earlierIso: string): number {
  return Math.round((new Date(laterIso).getTime() - new Date(earlierIso).getTime()) / 60_000);
}

async function fetchFlight(
  flightNumber: string,
  day: string,
  apiKey: string,
): Promise<FlightContract[] | null> {
  const url = `https://${RAPIDAPI_HOST}/flights/number/${encodeURIComponent(flightNumber)}/${day}`;
  const res = await fetch(url, {
    headers: {
      "X-RapidAPI-Key": apiKey,
      "X-RapidAPI-Host": RAPIDAPI_HOST,
    },
  });
  if (res.status === 204) return [];
  if (!res.ok) {
    console.error("AeroDataBox error", res.status, await res.text());
    return null;
  }
  return (await res.json()) as FlightContract[];
}

Deno.serve(async (req) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  const apiKey = Deno.env.get("AERODATABOX_RAPIDAPI_KEY");
  if (!apiKey) {
    return new Response("AERODATABOX_RAPIDAPI_KEY non configurata", { status: 500 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const today = londonDay(new Date());
  const tomorrow = addDaysIso(today, 1);

  const { data: rows, error } = await supabase
    .from("events")
    .select("id, day, flight_number, flight_leg")
    .not("flight_number", "is", null)
    .in("day", [today, tomorrow]);

  if (error) {
    return new Response(`Query error: ${error.message}`, { status: 500 });
  }

  const trackedFlights = (rows ?? []) as TrackedFlightEvent[];
  const results: string[] = [];

  for (const event of trackedFlights) {
    const contracts = await fetchFlight(event.flight_number, event.day, apiKey);
    if (!contracts || contracts.length === 0) {
      results.push(`${event.flight_number}: nessun dato`);
      continue;
    }

    // Se AeroDataBox restituisce più voli con lo stesso numero (raro, ma
    // possibile su date adiacenti), prendiamo quello la cui tappa di
    // interesse è schedulata proprio nel giorno atteso.
    const movementKey = event.flight_leg;
    const contract =
      contracts.find((c) => c[movementKey]?.scheduledTime?.local.slice(0, 10) === event.day) ??
      contracts[0];

    const movement = contract[movementKey];
    const scheduled = movement?.scheduledTime?.utc;
    const revised = movement?.revisedTime?.utc ?? movement?.predictedTime?.utc;
    const delayMinutes = scheduled && revised ? Math.max(0, minutesBetween(revised, scheduled)) : 0;

    const patch: Record<string, unknown> = { delay_minutes: delayMinutes };
    if (contract.status === "Canceled" || contract.status === "CanceledUncertain") {
      patch.start_time_label = "Volo cancellato";
    } else if (contract.status === "Diverted") {
      patch.start_time_label = "Volo dirottato";
    }

    const { error: updateError } = await supabase.from("events").update(patch).eq("id", event.id);
    if (updateError) {
      console.error("update error", event.id, updateError);
      continue;
    }
    results.push(`${event.flight_number}: status=${contract.status} ritardo=${delayMinutes}min`);
  }

  return new Response(JSON.stringify({ checked: results }), {
    headers: { "Content-Type": "application/json" },
  });
});
