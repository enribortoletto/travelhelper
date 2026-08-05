import type { EventRow } from "./types";

/**
 * §9: a universal maps "directions" link — opens the native maps app on
 * mobile, falls back to a web maps URL in the browser. Prefer the resolved
 * place id (more precise, works cross-platform via Google's universal link);
 * fall back to a raw stored link; null if neither is available.
 */
export function buildNavigationLink(stop: Pick<EventRow, "maps_place_id" | "maps_link" | "name">): string | null {
  if (stop.maps_place_id) {
    const destination = encodeURIComponent(stop.name);
    return `https://www.google.com/maps/dir/?api=1&destination=${destination}&destination_place_id=${stop.maps_place_id}`;
  }
  return stop.maps_link || null;
}
