import { useEffect, useState } from "react";
import { AIRPORT_PLACE_ID, DOUBLETREE_PLACE_ID, FOUR_BY_FOUR_HIRE_PLACE_ID } from "@/lib/constants";

export type TravelMode = "driving" | "walking" | "transit";

interface DrivingResult {
  text: string;
  seconds: number;
  distanceMeters: number;
  mode: TravelMode;
}

// Cache di modulo condivisa tra useDrivingTime e useDrivingSeconds, per
// evitare di richiamare Directions più volte per la stessa coppia di tappe
// nella stessa sessione (es. il connettore in Oggi e la dashboard in
// Viaggio possono chiedere la stessa tratta).
const cache = new Map<string, DrivingResult | null>();
const pending = new Set<string>();
// Timestamp dell'ultimo fallimento per chiave: un errore transitorio (rete,
// rate-limit momentaneo) non deve bloccare la tratta per il resto della
// sessione — dopo un breve cooldown un nuovo render può ritentare. Un
// successo (chiave assente da qui) resta invece in cache per sempre.
const failedAt = new Map<string, number>();
const RETRY_COOLDOWN_MS = 60_000;
const listeners = new Map<string, Set<() => void>>();
let directionsService: google.maps.DirectionsService | null = null;

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

/**
 * Determina il mezzo di spostamento reale tra due tappe:
 * - mezzi pubblici tra DoubleTree e 4X4 Hire Scotland Ltd (ritiro/riconsegna
 *   auto: non si ha l'auto a noleggio in quel momento, e non è a piedi)
 * - a piedi da/per l'aeroporto (es. il DoubleTree è affacciato sul terminal)
 * - in auto in tutti gli altri casi
 */
export function determineTravelMode(originPlaceId: string, destinationPlaceId: string): TravelMode {
  const pair = new Set([originPlaceId, destinationPlaceId]);
  if (pair.has(DOUBLETREE_PLACE_ID) && pair.has(FOUR_BY_FOUR_HIRE_PLACE_ID)) return "transit";
  if (pair.has(AIRPORT_PLACE_ID)) return "walking";
  return "driving";
}

function toGoogleTravelMode(mode: TravelMode): google.maps.TravelMode {
  if (mode === "walking") return google.maps.TravelMode.WALKING;
  if (mode === "transit") return google.maps.TravelMode.TRANSIT;
  return google.maps.TravelMode.DRIVING;
}

function fetchIfNeeded(key: string, originPlaceId: string, destinationPlaceId: string) {
  if (pending.has(key)) return;
  if (cache.has(key)) {
    const lastFailure = failedAt.get(key);
    if (lastFailure === undefined) return; // successo già in cache, per sempre
    if (Date.now() - lastFailure < RETRY_COOLDOWN_MS) return; // fallito di recente, aspetta il cooldown
  }
  if (typeof google === "undefined" || !google.maps) return;
  if (!directionsService) directionsService = new google.maps.DirectionsService();

  pending.add(key);

  const mode = determineTravelMode(originPlaceId, destinationPlaceId);

  directionsService.route(
    {
      origin: { placeId: originPlaceId },
      destination: { placeId: destinationPlaceId },
      travelMode: toGoogleTravelMode(mode),
    },
    (result, status) => {
      const leg = status === "OK" ? result?.routes[0]?.legs[0] : null;
      const value: DrivingResult | null = leg?.duration
        ? {
            text: leg.duration.text,
            seconds: leg.duration.value,
            distanceMeters: leg.distance?.value ?? 0,
            mode,
          }
        : null;
      cache.set(key, value);
      if (value === null) failedAt.set(key, Date.now());
      else failedAt.delete(key);
      pending.delete(key);
      notify(key);
    },
  );
}

function useDrivingResult(
  originPlaceId: string | null,
  destinationPlaceId: string | null,
): DrivingResult | null {
  const key = originPlaceId && destinationPlaceId ? `${originPlaceId}|${destinationPlaceId}` : null;
  const [, forceRender] = useState(0);

  useEffect(() => {
    if (!key || !originPlaceId || !destinationPlaceId) return;
    fetchIfNeeded(key, originPlaceId, destinationPlaceId);
    return subscribe(key, () => forceRender((n) => n + 1));
  }, [key, originPlaceId, destinationPlaceId]);

  return key ? (cache.get(key) ?? null) : null;
}

/**
 * Tempo di spostamento reale tra due place_id (Directions API, 03-integrations.md).
 * `mode` indica auto/piedi/mezzi pubblici (vedi determineMode), così chi
 * mostra il testo può scegliere l'icona e l'etichetta giusta invece di
 * assumere sempre l'auto.
 */
export function useDrivingTime(
  originPlaceId: string | null,
  destinationPlaceId: string | null,
): { text: string; mode: TravelMode } | null {
  const result = useDrivingResult(originPlaceId, destinationPlaceId);
  return result ? { text: result.text, mode: result.mode } : null;
}

/** Come useDrivingTime, ma in secondi grezzi — utile per sommare tratte multiple. */
export function useDrivingSeconds(
  originPlaceId: string | null,
  destinationPlaceId: string | null,
): number | null {
  return useDrivingResult(originPlaceId, destinationPlaceId)?.seconds ?? null;
}

/**
 * Come useDrivingTime/useDrivingSeconds, ma restituisce l'intero risultato
 * (testo, secondi, distanza, modalità) da un'unica sottoscrizione — utile
 * quando serve più di un valore per la stessa tratta (es. km + minuti) senza
 * duplicare la chiamata Directions.
 */
export function useDrivingDetails(
  originPlaceId: string | null,
  destinationPlaceId: string | null,
): DrivingResult | null {
  return useDrivingResult(originPlaceId, destinationPlaceId);
}
