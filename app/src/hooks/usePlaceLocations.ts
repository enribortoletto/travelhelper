import { useEffect, useState } from "react";
import { useMapsLibrary } from "@vis.gl/react-google-maps";

// Cache di modulo: i place_id sono statici (vengono dall'Excel), quindi una
// volta risolta una posizione non serve richiederla di nuovo in questa sessione.
const cache = new Map<string, google.maps.LatLngLiteral | null>();
// Come in useDrivingTime.ts/usePlaceDetails.ts: un fallimento transitorio non
// blocca il place_id per sempre, solo per un breve cooldown prima di poter
// ritentare la risoluzione.
const failedAt = new Map<string, number>();
const RETRY_COOLDOWN_MS = 60_000;

function snapshot(placeIds: string[]): Record<string, google.maps.LatLngLiteral | null> {
  const out: Record<string, google.maps.LatLngLiteral | null> = {};
  for (const id of placeIds) out[id] = cache.get(id) ?? null;
  return out;
}

function needsFetch(id: string): boolean {
  if (!cache.has(id)) return true;
  const lastFailure = failedAt.get(id);
  if (lastFailure === undefined) return false;
  return Date.now() - lastFailure >= RETRY_COOLDOWN_MS;
}

/**
 * Risolve una lista di place_id in coordinate usando la Places API (New)
 * (classe `Place`, non la `PlacesService` legacy — 03-integrations.md).
 * Deve essere usato da un componente dentro <APIProvider>.
 */
export function usePlaceLocations(placeIds: string[]) {
  const placesLib = useMapsLibrary("places");
  const [locations, setLocations] = useState<Record<string, google.maps.LatLngLiteral | null>>(
    {},
  );
  const idsKey = placeIds.join(",");

  useEffect(() => {
    if (!placesLib || placeIds.length === 0) return;

    const toFetch = placeIds.filter(needsFetch);
    if (toFetch.length === 0) {
      setLocations(snapshot(placeIds));
      return;
    }

    let cancelled = false;
    Promise.all(
      toFetch.map(async (placeId) => {
        try {
          const place = new placesLib.Place({ id: placeId });
          await place.fetchFields({ fields: ["location"] });
          cache.set(placeId, place.location ? place.location.toJSON() : null);
          failedAt.delete(placeId);
        } catch {
          cache.set(placeId, null);
          failedAt.set(placeId, Date.now());
        }
      }),
    ).then(() => {
      if (!cancelled) setLocations(snapshot(placeIds));
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placesLib, idsKey]);

  return locations;
}
