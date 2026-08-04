// Import iniziale del seed da Viaggio_Scozia_Eventi.xlsx (foglio "Eventi")
// verso la tabella `events` di Supabase.
//
// Uso:
//   npm run import:dry-run   -> valida e scrive scripts/output/events-seed.json, nessuna scrittura in Supabase
//   npm run import:apply     -> scrive davvero su Supabase (richiede SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
//
// Mappatura colonne come da files/01-data-model.md.

import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { createClient } from "@supabase/supabase-js";

const EXCEL_PATH = path.resolve(import.meta.dirname, "../files/Viaggio_Scozia_Eventi.xlsx");
const OUTPUT_PATH = path.resolve(import.meta.dirname, "output/events-seed.json");
const SHEET_NAME = "Eventi";

const TRIP = {
  name: "Scozia 2026",
  start_date: "2026-08-10",
  end_date: "2026-08-16",
};

type EventCategory = "alloggio" | "tappa" | "attivita" | "relax" | "trasporto" | "nota";
type StatusPlan = "nel_piano" | "facoltativo";
type Priority = "alta" | "media" | "bassa";

interface SeedEvent {
  day: string | null;
  category: EventCategory;
  name: string;
  status_plan: StatusPlan;
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
  priority: Priority | null;
}

const CATEGORY_MAP: Record<string, EventCategory> = {
  alloggio: "alloggio",
  tappa: "tappa",
  attivita: "attivita",
  relax: "relax",
  trasporto: "trasporto",
  nota: "nota",
};

const STATUS_MAP: Record<string, StatusPlan> = {
  "nel piano": "nel_piano",
  facoltativo: "facoltativo",
};

const PRIORITY_MAP: Record<string, Priority> = {
  alta: "alta",
  media: "media",
  bassa: "bassa",
};

function normalize(raw: unknown): string {
  return String(raw ?? "").trim().toLowerCase();
}

function cell(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  return s === "" ? null : s;
}

/**
 * Separa un campo orario libero (es. "20:00 (check-in)", "13:40 (partenza)",
 * "da verificare", "Check-out 2026-08-16") in un `time` puro (HH:MM:SS,
 * usato per i calcoli) e un `label` testuale con le note residue.
 * Se non c'è un orario HH:MM all'inizio della stringa, l'intero testo
 * diventa il label e il tempo resta "da definire" (null).
 */
function parseTimeField(raw: unknown): { time: string | null; label: string | null } {
  const s = cell(raw);
  if (!s) return { time: null, label: null };

  const match = s.match(/^(\d{1,2}):(\d{2})/);
  if (!match) {
    return { time: null, label: s };
  }

  const hh = match[1].padStart(2, "0");
  const mm = match[2];
  const time = `${hh}:${mm}:00`;

  let rest = s.slice(match[0].length).trim();
  rest = rest.replace(/^[-,]\s*/, "");
  if (rest.startsWith("(") && rest.endsWith(")")) {
    rest = rest.slice(1, -1).trim();
  }

  return { time, label: rest || null };
}

function extractPlaceId(link: unknown): string | null {
  const s = cell(link);
  if (!s) return null;
  const match = s.match(/place_id:([^&\s]+)/);
  return match ? match[1] : null;
}

function parseDay(raw: unknown): string | null {
  const s = cell(raw);
  if (!s) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function parseBoolean(raw: unknown): boolean {
  return normalize(raw) === "si";
}

interface ParseWarning {
  row: number;
  message: string;
}

async function parseWorkbook(): Promise<{
  events: SeedEvent[];
  warnings: ParseWarning[];
  skipped: number;
}> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(EXCEL_PATH);
  const sheet = workbook.getWorksheet(SHEET_NAME);
  if (!sheet) throw new Error(`Foglio "${SHEET_NAME}" non trovato nel workbook`);

  const events: SeedEvent[] = [];
  const warnings: ParseWarning[] = [];
  let skipped = 0;

  // riga 1 è l'header; i dati partono dalla riga 2
  for (let rowNum = 2; rowNum <= sheet.rowCount; rowNum++) {
    const row = sheet.getRow(rowNum);
    // colonne 0-indexed (0=A..13=N) come nella mappatura di 01-data-model.md
    const r: (string | null)[] = [];
    for (let col = 1; col <= 14; col++) {
      const text = row.getCell(col).text;
      r.push(text && text.trim() !== "" ? text : null);
    }

    const name = cell(r[2]);
    const statusRaw = normalize(r[3]);

    // "Ignora le righe di esempio o senza Nome evento" + righe senza
    // Nel piano/Facoltativo valorizzato (01-data-model.md)
    if (!name || !statusRaw) {
      skipped++;
      continue;
    }

    const categoryRaw = normalize(r[1]);
    const category = CATEGORY_MAP[categoryRaw];
    if (!category) {
      warnings.push({ row: rowNum, message: `Categoria sconosciuta: "${r[1]}"` });
      skipped++;
      continue;
    }

    const statusPlan = STATUS_MAP[statusRaw];
    if (!statusPlan) {
      warnings.push({ row: rowNum, message: `Status sconosciuto: "${r[3]}"` });
      skipped++;
      continue;
    }

    const start = parseTimeField(r[4]);
    const end = parseTimeField(r[5]);
    const priorityRaw = normalize(r[13]);
    const openingHoursRaw = cell(r[9]);

    events.push({
      day: parseDay(r[0]),
      category,
      name,
      status_plan: statusPlan,
      start_time: start.time,
      start_time_label: start.label,
      end_time: end.time,
      end_time_label: end.label,
      maps_place_id: extractPlaceId(r[6]),
      maps_link: cell(r[6]),
      website: cell(r[7]),
      price: cell(r[8]),
      opening_hours: openingHoursRaw ? { raw: openingHoursRaw } : null,
      description: cell(r[10]),
      contact: cell(r[11]),
      weather_dependent: parseBoolean(r[12]),
      priority: priorityRaw ? (PRIORITY_MAP[priorityRaw] ?? null) : null,
    });
  }

  return { events, warnings, skipped };
}

function printSummary(events: SeedEvent[], warnings: ParseWarning[], skipped: number) {
  const byCategory = new Map<string, number>();
  const byStatus = new Map<string, number>();
  let missingDay = 0;
  let missingPlaceId = 0;

  for (const e of events) {
    byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + 1);
    byStatus.set(e.status_plan, (byStatus.get(e.status_plan) ?? 0) + 1);
    if (!e.day) missingDay++;
    if (!e.maps_place_id) missingPlaceId++;
  }

  console.log(`\nEventi importati: ${events.length} (righe ignorate: ${skipped})`);
  console.log("Per categoria:", Object.fromEntries(byCategory));
  console.log("Per stato:", Object.fromEntries(byStatus));
  console.log(`Senza giorno assegnato: ${missingDay}`);
  console.log(`Senza maps_place_id: ${missingPlaceId}`);

  if (warnings.length > 0) {
    console.log(`\n${warnings.length} warning:`);
    for (const w of warnings) console.log(`  riga ${w.row}: ${w.message}`);
  }
}

async function applyToSupabase(events: SeedEvent[]) {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sono richieste per --apply (vedi supabase/SETUP.md)",
    );
  }

  const supabase = createClient(url, serviceKey);

  const { data: existingTrip, error: findError } = await supabase
    .from("trips")
    .select("id")
    .eq("name", TRIP.name)
    .maybeSingle();
  if (findError) throw findError;

  let tripId = existingTrip?.id as string | undefined;
  if (!tripId) {
    const { data: newTrip, error: insertTripError } = await supabase
      .from("trips")
      .insert(TRIP)
      .select("id")
      .single();
    if (insertTripError) throw insertTripError;
    tripId = newTrip.id as string;
    console.log(`Creato trip "${TRIP.name}" (${tripId})`);
  } else {
    console.log(`Trip "${TRIP.name}" già esistente (${tripId}), aggiungo gli eventi`);
  }

  const rows = events.map((e) => ({ ...e, trip_id: tripId }));
  const { error: insertEventsError } = await supabase.from("events").insert(rows);
  if (insertEventsError) throw insertEventsError;

  console.log(`Inseriti ${rows.length} eventi nel trip ${tripId}`);
}

async function main() {
  const apply = process.argv.includes("--apply");

  const { events, warnings, skipped } = await parseWorkbook();
  printSummary(events, warnings, skipped);

  mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(events, null, 2));
  console.log(`\nOutput scritto in ${path.relative(process.cwd(), OUTPUT_PATH)}`);

  if (apply) {
    console.log("\n--apply: scrivo su Supabase…");
    await applyToSupabase(events);
  } else {
    console.log("\nDry-run: nessuna scrittura su Supabase. Rilancia con --apply per importare davvero.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
