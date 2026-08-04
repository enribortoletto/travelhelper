import { differenceInCalendarDays, parseISO } from "date-fns";
import type { EventCategory, EventRow, TripRow } from "@/types/database";
import { CATEGORY_ORDER } from "./categories";
import { toIsoDay } from "./day";

export interface TripProgress {
  totalDays: number;
  dayIndex: number | null; // 1-based, solo se il viaggio è in corso oggi
  daysUntilStart: number; // negativo se il viaggio è già iniziato/finito
  phase: "before" | "during" | "after";
}

export function computeTripProgress(trip: TripRow, now: Date = new Date()): TripProgress {
  const start = parseISO(trip.start_date);
  const end = parseISO(trip.end_date);
  const today = parseISO(toIsoDay(now));
  const totalDays = differenceInCalendarDays(end, start) + 1;
  const daysUntilStart = differenceInCalendarDays(start, today);

  if (today < start) return { totalDays, dayIndex: null, daysUntilStart, phase: "before" };
  if (today > end) return { totalDays, dayIndex: null, daysUntilStart, phase: "after" };
  return {
    totalDays,
    dayIndex: differenceInCalendarDays(today, start) + 1,
    daysUntilStart,
    phase: "during",
  };
}

/**
 * Etichetta breve "a sigla" (stile aeroportuale, es. EDI/AVI/WIC nel design)
 * derivata dal nome reale dell'hotel/tappa di un giorno, non da dati finti:
 * prime 3 lettere della prima parola significativa, maiuscole.
 */
export function shortStopLabel(name: string | null | undefined): string {
  if (!name) return "—";
  const cleaned = name.replace(/[^\p{L}\s]/gu, " ").trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  const skip = new Set(["the", "il", "la", "lo", "le", "i", "gli", "by", "di", "da"]);
  const first = words.find((w) => !skip.has(w.toLowerCase())) ?? words[0] ?? name;
  return first.slice(0, 3).toUpperCase();
}

export function categoryBreakdown(events: EventRow[]): { category: EventCategory; count: number }[] {
  const counts = new Map<EventCategory, number>();
  for (const e of events) counts.set(e.category, (counts.get(e.category) ?? 0) + 1);
  return CATEGORY_ORDER.filter((c) => (counts.get(c) ?? 0) > 0).map((category) => ({
    category,
    count: counts.get(category) ?? 0,
  }));
}

export function eventsPerDay(events: EventRow[], days: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const day of days) out[day] = 0;
  for (const e of events) {
    if (e.day && e.day in out) out[e.day]++;
  }
  return out;
}

export interface ConsecutivePlacePair {
  key: string;
  from: string;
  to: string;
  /** Giorno a cui appartiene la tratta — serve solo a capire se è già "avvenuta". */
  day: string;
  /** Orario di inizio della tappa di arrivo (se noto) — usato con "day" per il progresso. */
  toStartTime: string | null;
}

/** Coppie consecutive (stesso giorno, entrambe con place_id) per cui sommare i tempi di guida. */
export function consecutivePlacePairs(events: EventRow[], days: string[]): ConsecutivePlacePair[] {
  const pairs: ConsecutivePlacePair[] = [];
  for (const day of days) {
    const dayEvents = events
      .filter((e) => e.day === day && e.maps_place_id)
      .sort((a, b) => (a.start_time ?? "99").localeCompare(b.start_time ?? "99"));
    for (let i = 1; i < dayEvents.length; i++) {
      const from = dayEvents[i - 1].maps_place_id!;
      const to = dayEvents[i].maps_place_id!;
      pairs.push({ key: `${from}|${to}`, from, to, day, toStartTime: dayEvents[i].start_time });
    }
  }
  return pairs;
}

function nowTimeString(now: Date): string {
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:00`;
}

/**
 * Un evento (o una tratta, guardando la tappa di arrivo) è "già avvenuto" se:
 * prima del viaggio → mai; dopo il viaggio → sempre; durante il viaggio → il
 * suo giorno è passato, oppure è oggi ed è già iniziato (in mancanza di
 * start_time non possiamo saperlo, quindi non lo contiamo come fatto).
 */
export function hasHappened(
  day: string | null,
  startTime: string | null,
  phase: TripProgress["phase"],
  todayIso: string,
  nowTime: string,
): boolean {
  if (!day) return false;
  if (phase === "after") return true;
  if (phase === "before") return false;
  if (day < todayIso) return true;
  if (day > todayIso) return false;
  return !!startTime && startTime <= nowTime;
}

export interface StopsProgress {
  done: number;
  total: number;
  fraction: number;
}

/** Quante tappe (sul totale) sono già "avvenute" rispetto al punto del viaggio in cui ci si trova ora. */
export function computeStopsProgress(events: EventRow[], trip: TripRow, now: Date = new Date()): StopsProgress {
  const total = events.length;
  const progress = computeTripProgress(trip, now);
  const todayIso = toIsoDay(now);
  const nowTime = nowTimeString(now);
  const done = events.filter((e) => hasHappened(e.day, e.start_time, progress.phase, todayIso, nowTime)).length;
  return { done, total, fraction: total > 0 ? done / total : 0 };
}

/** Per ogni tratta consecutiva, se è già "avvenuta" (cioè si è già arrivati alla tappa successiva). */
export function splitPairsByProgress(
  pairs: ConsecutivePlacePair[],
  trip: TripRow,
  now: Date = new Date(),
): { done: ConsecutivePlacePair[]; all: ConsecutivePlacePair[] } {
  const progress = computeTripProgress(trip, now);
  const todayIso = toIsoDay(now);
  const nowTime = nowTimeString(now);
  const done = pairs.filter((p) => hasHappened(p.day, p.toStartTime, progress.phase, todayIso, nowTime));
  return { done, all: pairs };
}
