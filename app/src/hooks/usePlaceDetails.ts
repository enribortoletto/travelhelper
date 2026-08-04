import { useEffect, useState } from "react";

export interface PlaceDetails {
  rating: number | null;
  userRatingCount: number | null;
  photoUrl: string | null;
  photoAttribution: string | null;
  isOpenNow: boolean | null;
}

// Stessa forma di cache/sottoscrizione di useDrivingTime.ts: un solo
// componente alla volta chiede i dettagli di un place_id (si apre un
// dettaglio evento per volta), ma la cache evita richieste ripetute se lo
// stesso evento viene riaperto nella sessione.
const cache = new Map<string, PlaceDetails | null>();
const pending = new Set<string>();
// Come in useDrivingTime.ts: un fallimento transitorio non blocca il
// place_id per sempre, solo per un breve cooldown prima di poter ritentare.
const failedAt = new Map<string, number>();
const RETRY_COOLDOWN_MS = 60_000;
const listeners = new Map<string, Set<() => void>>();

function notify(key: string) {
  listeners.get(key)?.forEach((fn) => fn());
}

function subscribe(key: string, fn: () => void) {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key)!.add(fn);
  return () => {
    listeners.get(key)?.delete(fn);
  };
}

async function fetchIfNeeded(placeId: string) {
  if (pending.has(placeId)) return;
  if (cache.has(placeId)) {
    const lastFailure = failedAt.get(placeId);
    if (lastFailure === undefined) return;
    if (Date.now() - lastFailure < RETRY_COOLDOWN_MS) return;
  }
  if (typeof google === "undefined" || !google.maps) return;

  pending.add(placeId);
  try {
    const placesLib = (await google.maps.importLibrary(
      "places",
    )) as google.maps.PlacesLibrary;
    const place = new placesLib.Place({ id: placeId });
    await place.fetchFields({
      fields: ["rating", "userRatingCount", "photos", "regularOpeningHours", "utcOffsetMinutes"],
    });

    let isOpenNow: boolean | null = null;
    try {
      isOpenNow = (await place.isOpen()) ?? null;
    } catch {
      isOpenNow = null;
    }

    const photo = place.photos?.[0] ?? null;
    cache.set(placeId, {
      rating: place.rating ?? null,
      userRatingCount: place.userRatingCount ?? null,
      photoUrl: photo ? photo.getURI({ maxWidth: 640 }) : null,
      photoAttribution: photo?.authorAttributions?.[0]?.displayName ?? null,
      isOpenNow,
    });
    failedAt.delete(placeId);
  } catch {
    cache.set(placeId, null);
    failedAt.set(placeId, Date.now());
  } finally {
    pending.delete(placeId);
    notify(placeId);
  }
}

/**
 * Dettagli arricchiti di un luogo (foto, valutazione, apertura in tempo
 * reale) via Places API (New) — 03-integrations.md. Non richiede il
 * contesto <APIProvider>: usa google.maps.importLibrary direttamente, come
 * useDrivingTime.
 */
export function usePlaceDetails(placeId: string | null): PlaceDetails | null {
  const [, forceRender] = useState(0);

  useEffect(() => {
    if (!placeId) return;
    fetchIfNeeded(placeId);
    return subscribe(placeId, () => forceRender((n) => n + 1));
  }, [placeId]);

  return placeId ? (cache.get(placeId) ?? null) : null;
}
