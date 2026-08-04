// Feed .ics pubblico del viaggio (03-integrations.md).
//
// - Solo eventi con status_plan = 'nel_piano' e day + start_time validi
//   diventano VEVENT (facoltativi e senza giorno restano fuori).
// - Rigenerato ad ogni richiesta (niente DB trigger): una cache breve
//   (5 minuti, via header Cache-Control) evita di ricalcolarlo ad ogni
//   refresh di un'app calendario che fa polling frequente.
// - Deve restare raggiungibile SENZA header di autenticazione: le app
//   calendario (Google/Apple Calendar) non li inviano quando si iscrivono
//   a un URL .ics. Va deployata con la verifica JWT disattivata per
//   questa funzione (vedi supabase/config.toml o il flag --no-verify-jwt).
//
// Semplificazione: il viaggio (10-16 agosto 2026) cade interamente in BST
// (UTC+1, ora legale nel Regno Unito), quindi le conversioni UTC qui sotto
// usano un offset fisso di un'ora invece di un VTIMEZONE completo.

import { createClient } from "jsr:@supabase/supabase-js@2";

const BST_OFFSET_HOURS = 1;

interface EventRow {
  id: string;
  day: string | null;
  name: string;
  start_time: string | null;
  end_time: string | null;
  description: string | null;
  price: string | null;
  maps_link: string | null;
  category: string;
  updated_at: string;
}

function escapeText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

// RFC 5545: le righe vanno "piegate" (folded) a 75 ottetti.
function foldLine(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const chunks: string[] = [];
  let rest = line;
  let first = true;
  while (rest.length > 0) {
    const limit = first ? 75 : 74;
    let chunk = rest.slice(0, limit);
    while (new TextEncoder().encode(chunk).length > limit) {
      chunk = chunk.slice(0, -1);
    }
    chunks.push((first ? "" : " ") + chunk);
    rest = rest.slice(chunk.length);
    first = false;
  }
  return chunks.join("\r\n");
}

function toUtcIcsDateTime(day: string, time: string): string {
  const [y, mo, d] = day.split("-").map(Number);
  const [h, mi, s] = time.split(":").map(Number);
  const localAsUtc = Date.UTC(y, mo - 1, d, h, mi, s ?? 0);
  const utc = new Date(localAsUtc - BST_OFFSET_HOURS * 3600_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${utc.getUTCFullYear()}${pad(utc.getUTCMonth() + 1)}${pad(utc.getUTCDate())}T` +
    `${pad(utc.getUTCHours())}${pad(utc.getUTCMinutes())}${pad(utc.getUTCSeconds())}Z`
  );
}

function toUtcIcsTimestamp(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T` +
    `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

function buildEvent(e: EventRow): string {
  const dtStart = toUtcIcsDateTime(e.day!, e.start_time!);
  const dtEnd = e.end_time
    ? toUtcIcsDateTime(e.day!, e.end_time)
    : toUtcIcsDateTime(e.day!, e.start_time!.slice(0, 2) === "23" ? "23:59:59" : addHour(e.start_time!));

  const descriptionParts = [e.description, e.price ? `Prezzo: ${e.price}` : null].filter(Boolean);

  const lines = [
    "BEGIN:VEVENT",
    `UID:${e.id}@scozia-2026`,
    `DTSTAMP:${toUtcIcsTimestamp(e.updated_at)}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeText(e.name)}`,
  ];
  if (descriptionParts.length > 0) {
    lines.push(`DESCRIPTION:${escapeText(descriptionParts.join(" — "))}`);
  }
  if (e.maps_link) {
    lines.push(`LOCATION:${escapeText(e.maps_link)}`);
    lines.push(`URL:${e.maps_link}`);
  }
  lines.push(`CATEGORIES:${escapeText(e.category)}`);
  lines.push("END:VEVENT");
  return lines.map(foldLine).join("\r\n");
}

function addHour(time: string): string {
  const [h, m, s] = time.split(":").map(Number);
  const total = (h + 1) % 24;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(total)}:${pad(m)}:${pad(s ?? 0)}`;
}

Deno.serve(async (req) => {
  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: trip, error: tripError } = await supabase
    .from("trips")
    .select("id, name")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (tripError || !trip) {
    return new Response("Trip not found", { status: 404 });
  }

  const { data: events, error: eventsError } = await supabase
    .from("events")
    .select("id, day, name, start_time, end_time, description, price, maps_link, category, updated_at")
    .eq("trip_id", trip.id)
    .eq("status_plan", "nel_piano")
    .not("day", "is", null)
    .not("start_time", "is", null);

  if (eventsError) {
    return new Response(`Query error: ${eventsError.message}`, { status: 500 });
  }

  const calendarLines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Scozia 2026//Diario di viaggio//IT",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(trip.name)}`,
    "X-WR-TIMEZONE:Europe/London",
    ...(events as EventRow[]).map(buildEvent),
    "END:VCALENDAR",
  ];

  return new Response(calendarLines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="scozia-2026.ics"',
      "Cache-Control": "public, max-age=300",
    },
  });
});
