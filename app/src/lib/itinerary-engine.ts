import { supabase } from "./supabase";
import type { Trip } from "./types";

export interface ItineraryConflict {
  kind: "checkin_window" | "checkout_deadline" | "opening_hours" | "insufficient_travel_time";
  eventId: string;
  message: string;
}

/**
 * §5/§6/§7/§8: (re)generates a single day's derived transit/check-in/
 * check-out events and returns the conflicts found — via the
 * `recalculate-day` edge function, not client-side. `events` RLS only lets
 * an authenticated client write is_derived = false rows (derived rows are
 * a trusted-server-only write, by design, from Step 1), so the actual
 * day-sequencing and timing logic lives server-side; see that function's
 * source for the algorithm itself.
 */
export async function recalculateDay(tripId: string, day: string): Promise<ItineraryConflict[]> {
  const { data, error } = await supabase.functions.invoke<{ conflicts: ItineraryConflict[] }>("recalculate-day", {
    body: { tripId, day },
  });
  if (error) throw error;
  return data?.conflicts ?? [];
}

/** Recalculates every day in the trip's date range — used on itinerary load and after any stop change. */
export async function recalculateTrip(trip: Trip): Promise<ItineraryConflict[]> {
  const conflicts: ItineraryConflict[] = [];
  let day = trip.start_date;
  while (day <= trip.end_date) {
    conflicts.push(...(await recalculateDay(trip.id, day)));
    const [y, m, d] = day.split("-").map(Number);
    const next = new Date(Date.UTC(y, m - 1, d + 1));
    day = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
  }
  return conflicts;
}
