import { supabase } from "./supabase";
import { shiftTime } from "./status";
import type { WeeklyOpeningHours } from "./types";

/** §8: fetch a place's weekly opening-hours pattern via the maps-place-details edge function. */
export async function fetchOpeningHours(placeId: string): Promise<WeeklyOpeningHours | null> {
  const { data, error } = await supabase.functions.invoke<{ openingHours: WeeklyOpeningHours | null }>(
    "maps-place-details",
    { body: { placeId } },
  );
  if (error) throw error;
  return data?.openingHours ?? null;
}

/** yyyy-MM-dd → weekday index (0 = Sunday .. 6 = Saturday), parsed without going through the device's local timezone. */
export function weekdayOf(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export interface LegalStartWindow {
  earliest: string | null;
  latest: string | null;
}

/**
 * §8: earliest/latest legal start time for a stop with known opening hours.
 * Food-service stops (§8 "the kitchen closes before the venue does") are
 * constrained by kitchenClosingTime — explicit if set, else the venue's
 * closing time minus 1 hour — instead of the venue's own closing time.
 */
export function legalStartWindow({
  openingHours,
  day,
  visitDurationMinutes,
  isFoodService,
  kitchenClosingTime,
}: {
  openingHours: WeeklyOpeningHours | null;
  day: string | null;
  visitDurationMinutes: number | null;
  isFoodService: boolean;
  kitchenClosingTime: string | null;
}): LegalStartWindow {
  if (!openingHours || !day) return { earliest: null, latest: null };

  const hours = openingHours[String(weekdayOf(day))];
  if (!hours) return { earliest: null, latest: null };

  const closing = isFoodService ? kitchenClosingTime ?? shiftTime(hours.close, -60) : hours.close;
  const latest = visitDurationMinutes != null ? shiftTime(closing, -visitDurationMinutes) : null;

  return { earliest: hours.open, latest };
}
