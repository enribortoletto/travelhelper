import type { Trip } from "./types";

export type TripPhase = "planning" | "active" | "completed";

/**
 * Simplified stand-in for §4's full phase computation (which resolves "today"
 * in the trip's own IANA timezone). Good enough for a phase badge on the trip
 * list; the real day-boundary-aware version lands with Step 3/4's status
 * derivation engine.
 */
export function getTripPhase(trip: Pick<Trip, "start_date" | "end_date">): TripPhase {
  const today = new Date().toISOString().slice(0, 10);
  if (today < trip.start_date) return "planning";
  if (today > trip.end_date) return "completed";
  return "active";
}
