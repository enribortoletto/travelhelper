// §13 calendar export feed — a public, unauthenticated iCalendar feed per
// trip, gated by an unguessable token (trips.calendar_token) instead of a
// login, since calendar apps polling a subscribed feed URL don't send auth
// headers. Deployed with verify_jwt = false (see supabase/config.toml) —
// this is the one function in the project that must skip Supabase's normal
// JWT gate by design, not by omission.
//
// Regenerated on every request rather than cached in the DB, per §13 — the
// only caching is the HTTP Cache-Control header below, so a calendar app
// polling frequently doesn't force a recompute on every single poll.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Trip-local wall-clock time -> the actual UTC instant, DST-correct for that specific date. */
function zonedTimeToUtc(day: string, time: string, timeZone: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  const [hh, mm, ss] = time.split(":").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm, ss || 0));

  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(fmt.formatToParts(guess).map((p) => [p.type, p.value])) as Record<string, string>;
  const asIfUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  const offset = asIfUtc - guess.getTime();
  return new Date(guess.getTime() - offset);
}

function toIcsUtc(date: Date): string {
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T` +
    `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

/** §2's "+1h same day" fallback, reused here per §13. */
function fallbackEndTime(startTime: string): string {
  const [h, m] = startTime.split(":").map(Number);
  const total = h * 60 + m + 60;
  if (total >= 24 * 60) return "23:59:59";
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}:00`;
}

function escapeText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

/** RFC 5545 line folding: no content line may exceed 75 octets. */
function foldLine(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;

  let result = "";
  let chunk = "";
  let chunkBytes = 0;
  for (const char of line) {
    const charBytes = new TextEncoder().encode(char).length;
    if (chunkBytes + charBytes > 75) {
      result += (result ? "\r\n " : "") + chunk;
      chunk = "";
      chunkBytes = 0;
    }
    chunk += char;
    chunkBytes += charBytes;
  }
  result += (result ? "\r\n " : "") + chunk;
  return result;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) {
    return new Response("Missing token", { status: 400 });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: trip } = await admin.from("trips").select("*").eq("calendar_token", token).maybeSingle();
  if (!trip) {
    return new Response("Not found", { status: 404 });
  }

  const { data: events } = await admin
    .from("events")
    .select("*")
    .eq("trip_id", trip.id)
    .not("day", "is", null)
    .not("start_time", "is", null)
    .or("planning_status.eq.planned,is_derived.eq.true");

  const now = toIcsUtc(new Date());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Trip Companion//Calendar Export//EN",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${escapeText(trip.name)}`,
  ];

  for (const event of events ?? []) {
    const start = zonedTimeToUtc(event.day, event.start_time, trip.timezone);
    const endTime = event.end_time ?? fallbackEndTime(event.start_time);
    const end = zonedTimeToUtc(event.day, endTime, trip.timezone);

    lines.push("BEGIN:VEVENT");
    lines.push(foldLine(`UID:${event.id}@tripcompanion`));
    lines.push(foldLine(`DTSTAMP:${now}`));
    lines.push(foldLine(`DTSTART:${toIcsUtc(start)}`));
    lines.push(foldLine(`DTEND:${toIcsUtc(end)}`));
    lines.push(foldLine(`SUMMARY:${escapeText(event.name)}`));
    if (event.maps_link) lines.push(foldLine(`LOCATION:${escapeText(event.maps_link)}`));
    if (event.description) lines.push(foldLine(`DESCRIPTION:${escapeText(event.description)}`));
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  return new Response(lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="${trip.name.replace(/[^a-z0-9]/gi, "-")}.ics"`,
      "Cache-Control": "public, max-age=300",
    },
  });
});
