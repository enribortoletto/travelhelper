// Seed di trip_days: per ogni giorno del viaggio, un riepilogo testuale
// (posizione geografica, area/regione attraversata) — non presente
// nell'Excel, va generato una volta (01-data-model.md, 02-ux-flows.md).
//
// Uso:
//   npm run seed-days:dry-run   -> stampa i riepiloghi, nessuna scrittura
//   npm run seed-days:apply     -> scrive su trip_days (richiede SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
//
// Va eseguito DOPO import-events.ts --apply, perché risolve
// overnight_stay_event_id cercando l'evento "alloggio" di ciascun giorno
// già presente in `events`.

import { createClient } from "@supabase/supabase-js";
import { TRIP_NAME, DAY_SUMMARIES } from "./day-summaries.ts";

async function main() {
  const apply = process.argv.includes("--apply");

  console.log("Riepiloghi generati per", Object.keys(DAY_SUMMARIES).length, "giorni:\n");
  for (const [day, summary] of Object.entries(DAY_SUMMARIES)) {
    console.log(`${day}: ${summary}\n`);
  }

  if (!apply) {
    console.log("Dry-run: nessuna scrittura su Supabase. Rilancia con --apply per salvare.");
    return;
  }

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sono richieste per --apply");
  }

  const supabase = createClient(url, serviceKey);

  const { data: trip, error: tripError } = await supabase
    .from("trips")
    .select("id")
    .eq("name", TRIP_NAME)
    .single();
  if (tripError || !trip) {
    throw new Error(
      `Trip "${TRIP_NAME}" non trovato: esegui prima import-events.ts --apply. (${tripError?.message ?? ""})`,
    );
  }

  const { data: events, error: eventsError } = await supabase
    .from("events")
    .select("id, day, category")
    .eq("trip_id", trip.id)
    .eq("category", "alloggio");
  if (eventsError) throw eventsError;

  const overnightByDay = new Map<string, string>();
  for (const e of events ?? []) {
    if (e.day) overnightByDay.set(e.day, e.id);
  }

  const rows = Object.entries(DAY_SUMMARIES).map(([day, summary]) => ({
    trip_id: trip.id,
    day,
    summary,
    overnight_stay_event_id: overnightByDay.get(day) ?? null,
  }));

  const { error: upsertError } = await supabase
    .from("trip_days")
    .upsert(rows, { onConflict: "trip_id,day" });
  if (upsertError) throw upsertError;

  console.log(`\nScritti ${rows.length} trip_days per il trip ${trip.id}`);
  const missing = rows.filter((r) => !r.overnight_stay_event_id);
  if (missing.length > 0) {
    console.log(
      `Attenzione: nessun evento "alloggio" trovato per ${missing.map((r) => r.day).join(", ")}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
