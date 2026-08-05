import { toZonedTime } from "date-fns-tz";
import type { EventStatus } from "./types";

/** §2 fallback: start_time + 1 hour, clamped to 23:59:59 same day. */
export function fallbackEndTime(startTime: string): string {
  const [h, m, s = "00"] = startTime.split(":").map(Number);
  const totalMinutes = h * 60 + m + 60;
  if (totalMinutes >= 24 * 60) return "23:59:59";
  const endH = Math.floor(totalMinutes / 60);
  const endM = totalMinutes % 60;
  return `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** "yyyy-MM-dd" for "now" in the trip's own timezone — never the device's. */
export function getTodayString(timezone: string, now: Date = new Date()): string {
  const zonedNow = toZonedTime(now, timezone);
  return `${zonedNow.getFullYear()}-${String(zonedNow.getMonth() + 1).padStart(2, "0")}-${String(zonedNow.getDate()).padStart(2, "0")}`;
}

/** Shift a "HH:mm[:ss]" time by N minutes, clamped to the same day (00:00–23:59:59). */
export function shiftTime(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  if (total >= 24 * 60) return "23:59:59";
  const clamped = Math.max(0, total);
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}:00`;
}

interface StatusInput {
  day: string | null;
  startTime: string | null;
  endTime: string | null;
  isSkipped: boolean;
  timezone: string;
  now?: Date;
}

/** §2: pure derivation, day/start_time/end_time/skipped (+ trip tz/now) → status. */
export function deriveRuntimeStatus({
  day,
  startTime,
  endTime,
  isSkipped,
  timezone,
  now = new Date(),
}: StatusInput): EventStatus {
  if (isSkipped) return "skipped";
  if (!day || !startTime) return "inactive";

  const zonedNow = toZonedTime(now, timezone);
  const todayStr = `${zonedNow.getFullYear()}-${String(zonedNow.getMonth() + 1).padStart(2, "0")}-${String(zonedNow.getDate()).padStart(2, "0")}`;
  if (day !== todayStr) return "inactive";

  const nowMinutes = zonedNow.getHours() * 60 + zonedNow.getMinutes();
  const effectiveEnd = endTime ?? fallbackEndTime(startTime);
  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(effectiveEnd);

  if (nowMinutes >= startMinutes && nowMinutes <= endMinutes) return "in_progress";
  return "inactive";
}

interface PastInput {
  day: string | null;
  startTime: string | null;
  endTime: string | null;
  timezone: string;
  now?: Date;
}

/** §2 "past" flag: independent of status_runtime, drives only a UI badge. */
export function isPast({ day, startTime, endTime, timezone, now = new Date() }: PastInput): boolean {
  if (!day) return false;

  const zonedNow = toZonedTime(now, timezone);
  const todayStr = `${zonedNow.getFullYear()}-${String(zonedNow.getMonth() + 1).padStart(2, "0")}-${String(zonedNow.getDate()).padStart(2, "0")}`;

  if (day < todayStr) return true;
  if (day > todayStr) return false;

  // Today: past once its end time (or the +1h fallback, or midnight if even
  // start_time is missing) has elapsed.
  const nowMinutes = zonedNow.getHours() * 60 + zonedNow.getMinutes();
  if (!startTime) return nowMinutes >= 24 * 60 - 1;
  const effectiveEnd = endTime ?? fallbackEndTime(startTime);
  return nowMinutes > timeToMinutes(effectiveEnd);
}
