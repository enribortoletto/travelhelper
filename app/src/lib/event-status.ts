import type { EventRow, EventStatusRuntime } from "@/types/database";

// Il viaggio si svolge interamente in Scozia (Europe/London): gli orari degli
// eventi sono ora locale del Regno Unito, non del dispositivo che guarda
// l'app. Confrontarli con un Date costruito da stringa (che il browser
// interpreta nel SUO fuso locale) sfaserebbe "in corso"/"vissuta" di quante
// ore separano il fuso del dispositivo da quello del viaggio — capita
// testando da un altro paese prima della partenza. Si confrontano quindi
// stringhe "yyyy-MM-dd"/"HH:mm:ss" ottenute da Intl nel fuso del viaggio,
// stessa tecnica già usata server-side in supabase/functions/send-notifications.
const TRIP_TIME_ZONE = "Europe/London";

function nowInTripTimezone(now: Date): { day: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TRIP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return {
    day: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}:${get("second")}`,
  };
}

// Fallback "+1 ora" quando manca end_time, agganciato allo stesso giorno
// (mai oltre mezzanotte) — stessa scelta già fatta in ics-feed/index.ts.
function plusOneHourSameDay(time: string): string {
  const [h, m, s] = time.split(":").map(Number);
  if (h === 23) return "23:59:59";
  return `${String(h + 1).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s ?? 0).padStart(2, "0")}`;
}

/**
 * Stato runtime di un evento (02-ux-flows.md): Non attivo / In corso / Saltato.
 * "In corso" richiede un giorno e un orario di inizio reali (non un placeholder
 * testuale come "da verificare") — un end_time mancante fa da fallback a +1h.
 */
export function computeEventStatus(event: EventRow, now: Date = new Date()): EventStatusRuntime {
  if (event.is_skipped) return "saltato";
  if (!event.day || !event.start_time) return "non_attivo";

  const { day: today, time: nowTime } = nowInTripTimezone(now);
  if (event.day !== today) return "non_attivo";

  const end = event.end_time ?? plusOneHourSameDay(event.start_time);
  if (nowTime >= event.start_time && nowTime <= end) return "in_corso";
  return "non_attivo";
}

export function isEventInProgress(event: EventRow, now: Date = new Date()): boolean {
  return computeEventStatus(event, now) === "in_corso";
}

/**
 * Tappa "vissuta": il suo orario (o il giorno intero, se senza orario) è già
 * passato. Usato solo per un badge di completamento leggero — non incide su
 * nessuna logica del piano di viaggio.
 */
export function isEventPast(event: EventRow, now: Date = new Date()): boolean {
  if (!event.day) return false;

  const { day: today, time: nowTime } = nowInTripTimezone(now);
  if (event.day < today) return true;
  if (event.day > today) return false;

  const end = event.end_time ?? (event.start_time ? plusOneHourSameDay(event.start_time) : "23:59:59");
  return nowTime > end;
}
