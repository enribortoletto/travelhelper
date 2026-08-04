import type { EventRow } from "@/types/database";

/**
 * Deep link universale per aprire la navigazione verso l'evento in Google Maps
 * (03-integrations.md: apre l'app su iOS/Android, il browser come fallback).
 */
export function buildDirectionsUrl(event: Pick<EventRow, "maps_place_id" | "maps_link" | "name">): string | null {
  if (event.maps_place_id) {
    const params = new URLSearchParams({
      api: "1",
      destination: event.name,
      destination_place_id: event.maps_place_id,
      travelmode: "driving",
    });
    return `https://www.google.com/maps/dir/?${params.toString()}`;
  }
  return event.maps_link ?? null;
}
