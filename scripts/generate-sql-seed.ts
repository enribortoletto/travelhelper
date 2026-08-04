// Genera un unico file SQL statico (scripts/output/seed_data.sql) con trip,
// eventi e riepiloghi dei giorni, da incollare nello SQL Editor di Supabase —
// alternativa a import-events.ts/seed-trip-days.ts che non richiede la
// service role key (comoda quando non si vuole far girare script locali con
// un segreto così potente).
//
// Uso: npm run generate-sql-seed   (richiede di aver già lanciato
// import:dry-run almeno una volta, per avere scripts/output/events-seed.json)

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { TRIP_NAME, DAY_SUMMARIES } from "./day-summaries.ts";

const EVENTS_JSON_PATH = path.resolve(import.meta.dirname, "output/events-seed.json");
const OUTPUT_PATH = path.resolve(import.meta.dirname, "output/seed_data.sql");

const TRIP = { name: TRIP_NAME, start_date: "2026-08-10", end_date: "2026-08-16" };

interface SeedEvent {
  day: string | null;
  category: string;
  name: string;
  status_plan: string;
  start_time: string | null;
  start_time_label: string | null;
  end_time: string | null;
  end_time_label: string | null;
  maps_place_id: string | null;
  maps_link: string | null;
  website: string | null;
  price: string | null;
  opening_hours: { raw: string } | null;
  description: string | null;
  contact: string | null;
  weather_dependent: boolean;
  priority: string | null;
}

function sqlString(value: string | null): string {
  if (value === null) return "null";
  return `'${value.replace(/'/g, "''")}'`;
}

function sqlBool(value: boolean): string {
  return value ? "true" : "false";
}

function sqlJsonb(value: { raw: string } | null): string {
  if (value === null) return "null";
  const json = JSON.stringify(value).replace(/'/g, "''");
  return `'${json}'::jsonb`;
}

function eventRowSql(e: SeedEvent): string {
  return [
    sqlString(e.day),
    sqlString(e.category),
    sqlString(e.name),
    sqlString(e.status_plan),
    sqlString(e.start_time),
    sqlString(e.start_time_label),
    sqlString(e.end_time),
    sqlString(e.end_time_label),
    sqlString(e.maps_place_id),
    sqlString(e.maps_link),
    sqlString(e.website),
    sqlString(e.price),
    sqlJsonb(e.opening_hours),
    sqlString(e.description),
    sqlString(e.contact),
    sqlBool(e.weather_dependent),
    sqlString(e.priority),
  ].join(", ");
}

function main() {
  const events: SeedEvent[] = JSON.parse(readFileSync(EVENTS_JSON_PATH, "utf-8"));

  const lines: string[] = [];
  lines.push("-- Generato da scripts/generate-sql-seed.ts — incollare nello SQL Editor di Supabase.");
  lines.push("-- Crea il trip (se non esiste), importa gli eventi e i riepiloghi dei giorni.");
  lines.push("");
  lines.push("insert into trips (name, start_date, end_date)");
  lines.push(
    `select ${sqlString(TRIP.name)}, ${sqlString(TRIP.start_date)}, ${sqlString(TRIP.end_date)}`,
  );
  lines.push(`where not exists (select 1 from trips where name = ${sqlString(TRIP.name)});`);
  lines.push("");

  lines.push("insert into events (");
  lines.push(
    "  trip_id, day, category, name, status_plan, start_time, start_time_label,",
  );
  lines.push(
    "  end_time, end_time_label, maps_place_id, maps_link, website, price,",
  );
  lines.push("  opening_hours, description, contact, weather_dependent, priority");
  lines.push(") values");

  const eventValues = events.map(
    (e, i) =>
      `  ((select id from trips where name = ${sqlString(TRIP.name)}), ${eventRowSql(e)})` +
      (i < events.length - 1 ? "," : ";"),
  );
  lines.push(...eventValues);
  lines.push("");

  lines.push("insert into trip_days (trip_id, day, summary, overnight_stay_event_id)");
  const dayEntries = Object.entries(DAY_SUMMARIES);
  dayEntries.forEach(([day, summary], i) => {
    const tripIdSubquery = `(select id from trips where name = ${sqlString(TRIP.name)})`;
    const overnightSubquery = `(select id from events where trip_id = ${tripIdSubquery} and category = 'alloggio' and day = ${sqlString(day)}::date limit 1)`;
    lines.push(
      // ::date esplicito: dentro una UNION ALL Postgres risolve il tipo del
      // letterale come text prima che l'INSERT possa applicare il cast
      // implicito alla colonna `day` (date), altrimenti errore 42804.
      `select ${tripIdSubquery}, ${sqlString(day)}::date, ${sqlString(summary)}, ${overnightSubquery}` +
        (i < dayEntries.length - 1 ? "\nunion all" : ""),
    );
  });
  lines.push("on conflict (trip_id, day) do update set summary = excluded.summary, overnight_stay_event_id = excluded.overnight_stay_event_id;");
  lines.push("");

  writeFileSync(OUTPUT_PATH, lines.join("\n"));
  console.log(`Scritto ${path.relative(process.cwd(), OUTPUT_PATH)} (${events.length} eventi, ${dayEntries.length} giorni)`);
}

main();
