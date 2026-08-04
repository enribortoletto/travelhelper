import { useEffect, useState } from "react";

interface DistanceResult {
  distanceText: string;
  durationText: string;
}

/**
 * Distanza/tempo di guida dalla posizione attuale dell'utente alla tappa
 * (Geolocation + Directions API). Richiede il permesso di posizione del
 * browser: se negato o non disponibile, resta semplicemente vuoto — non è
 * un'informazione essenziale, solo un arricchimento della scheda.
 */
export function useDistanceFromMe(destinationPlaceId: string | null) {
  const [result, setResult] = useState<DistanceResult | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "denied" | "unavailable" | "done">(
    "idle",
  );

  useEffect(() => {
    setResult(null);
    if (!destinationPlaceId) {
      setStatus("idle");
      return;
    }
    if (!("geolocation" in navigator) || typeof google === "undefined" || !google.maps) {
      setStatus("unavailable");
      return;
    }

    let cancelled = false;
    setStatus("loading");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (cancelled) return;
        const origin = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        const service = new google.maps.DirectionsService();
        service.route(
          {
            origin,
            destination: { placeId: destinationPlaceId },
            travelMode: google.maps.TravelMode.DRIVING,
          },
          (routeResult, routeStatus) => {
            if (cancelled) return;
            const leg = routeStatus === "OK" ? routeResult?.routes[0]?.legs[0] : null;
            if (leg?.distance && leg?.duration) {
              setResult({ distanceText: leg.distance.text, durationText: leg.duration.text });
              setStatus("done");
            } else {
              setStatus("unavailable");
            }
          },
        );
      },
      () => {
        if (!cancelled) setStatus("denied");
      },
      { timeout: 8000, maximumAge: 5 * 60_000 },
    );

    return () => {
      cancelled = true;
    };
  }, [destinationPlaceId]);

  return { result, status };
}
