import { addDays, format, isWithinInterval, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import type { EventRow, TripRow } from "@/types/database";

export function toIsoDay(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function initialSelectedDay(trip: TripRow, now: Date = new Date()): string {
  const start = parseISO(trip.start_date);
  const end = parseISO(trip.end_date);
  if (isWithinInterval(now, { start, end })) return toIsoDay(now);
  return trip.start_date;
}

export function shiftDay(day: string, delta: number): string {
  return toIsoDay(addDays(parseISO(day), delta));
}

export function isDayWithinTrip(day: string, trip: TripRow): boolean {
  return day >= trip.start_date && day <= trip.end_date;
}

export function enumerateDays(trip: TripRow): string[] {
  const days: string[] = [];
  let cursor = trip.start_date;
  while (cursor <= trip.end_date) {
    days.push(cursor);
    cursor = shiftDay(cursor, 1);
  }
  return days;
}

export function formatDayLong(day: string): string {
  // es. "mercoledì 12 agosto"
  return format(parseISO(day), "EEEE d MMMM", { locale: it });
}

export function formatDayShort(day: string): string {
  return format(parseISO(day), "EEE d/M", { locale: it });
}

export function formatTime(time: string | null): string | null {
  if (!time) return null;
  return time.slice(0, 5);
}

/** Sposta un orario "HH:MM[:SS]" di un tot di secondi (anche negativo), restituendo "HH:MM". */
export function shiftTime(time: string, deltaSeconds: number): string {
  const [h, m, s] = time.split(":").map(Number);
  const total = h * 3600 + m * 60 + (s || 0) + deltaSeconds;
  const clamped = ((Math.round(total) % 86400) + 86400) % 86400;
  const hh = Math.floor(clamped / 3600);
  const mm = Math.floor((clamped % 3600) / 60);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** true se `a` è cronologicamente dopo `b` (stringhe "HH:MM[:SS]", stesso giorno). */
export function isTimeAfter(a: string, b: string): boolean {
  const norm = (t: string) => {
    const [h, m, s] = t.split(":").map(Number);
    return h * 3600 + m * 60 + (s || 0);
  };
  return norm(a) > norm(b);
}

/**
 * Ordine delle tappe per il tragitto/mappa di un giorno (non per la lista
 * visibile, che resta ordinata per orario): il percorso reale inizia
 * dall'alloggio della notte precedente (dove ci si sveglia quella mattina) e
 * finisce all'alloggio della notte successiva (dove si dorme quella sera),
 * anche se quest'ultimo non è cronologicamente l'ultimo evento del giorno
 * (es. una cena dopo il check-in). Il primo giorno del viaggio non ha una
 * notte precedente da anteporre, l'ultimo non ha una notte successiva da
 * aggiungere in fondo.
 */
export function buildDayRouteEventIds(
  dayEvents: EventRow[],
  allEvents: EventRow[],
  day: string,
  trip: TripRow,
): string[] {
  const ids: string[] = [];

  if (day > trip.start_date) {
    const prevDay = shiftDay(day, -1);
    const prevNightHotel = allEvents.find((e) => e.day === prevDay && e.category === "alloggio");
    if (prevNightHotel) ids.push(prevNightHotel.id);
  }

  const nextNightHotel = day < trip.end_date ? dayEvents.find((e) => e.category === "alloggio") : undefined;
  for (const event of dayEvents) {
    if (nextNightHotel && event.id === nextNightHotel.id) continue;
    ids.push(event.id);
  }
  if (nextNightHotel) ids.push(nextNightHotel.id);

  return ids;
}

/**
 * Id degli alloggi "di bordo" (notte precedente/notte successiva) usati da
 * buildDayRouteEventIds, per poterli distinguere visivamente nella lista
 * Itinerario Dettagliato invece di mostrarli come una tappa qualunque.
 */
export function getDayRouteAnchors(
  dayEvents: EventRow[],
  allEvents: EventRow[],
  day: string,
  trip: TripRow,
): { prevNightId: string | null; nextNightId: string | null } {
  let prevNightId: string | null = null;
  if (day > trip.start_date) {
    const prevDay = shiftDay(day, -1);
    const prevNightHotel = allEvents.find((e) => e.day === prevDay && e.category === "alloggio");
    prevNightId = prevNightHotel?.id ?? null;
  }

  const nextNightId =
    day < trip.end_date ? (dayEvents.find((e) => e.category === "alloggio")?.id ?? null) : null;

  return { prevNightId, nextNightId };
}
