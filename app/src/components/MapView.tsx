import { useEffect, useMemo, useState } from "react";
import { Map as GoogleMap, AdvancedMarker, Pin, Polyline, useMap } from "@vis.gl/react-google-maps";
import { env } from "@/lib/env";
import { CATEGORY_CONFIG } from "@/lib/categories";
import { AIRPORT_PLACE_ID } from "@/lib/constants";
import { usePlaceLocations } from "@/hooks/usePlaceLocations";
import { determineTravelMode, type TravelMode } from "@/hooks/useDrivingTime";
import type { EventRow } from "@/types/database";

interface MapViewProps {
  events: EventRow[];
  onEventClick?: (event: EventRow) => void;
  /** Se presente, la mappa si centra solo su questi eventi invece che su tutti quelli visibili. */
  focusEventIds?: string[];
  /** Se presenti (>= 2, in ordine cronologico), disegna il tragitto su strada tra queste tappe. */
  routeEventIds?: string[];
  defaultCenter?: google.maps.LatLngLiteral;
  defaultZoom?: number;
  className?: string;
}

// Centro approssimativo delle Highlands scozzesi, usato finché non ci sono pin risolti.
const SCOTLAND_CENTER = { lat: 57.3, lng: -4.5 };

type MapMarkersProps = Omit<MapViewProps, "defaultCenter" | "defaultZoom" | "className">;

function MapMarkers({ events, onEventClick, focusEventIds, routeEventIds }: MapMarkersProps) {
  const placeIds = useMemo(
    () => [...new Set(events.map((e) => e.maps_place_id).filter((id): id is string => !!id))],
    [events],
  );
  const locations = usePlaceLocations(placeIds);
  const map = useMap();

  const markers = events
    .filter((e) => e.maps_place_id && locations[e.maps_place_id])
    .map((e) => ({ event: e, position: locations[e.maps_place_id!]! }));

  const focusSet = focusEventIds ? new Set(focusEventIds) : null;
  const boundsMarkers = focusSet ? markers.filter((m) => focusSet.has(m.event.id)) : markers;

  useEffect(() => {
    if (!map || boundsMarkers.length === 0) return;
    if (boundsMarkers.length === 1) {
      map.panTo(boundsMarkers[0].position);
      map.setZoom(13);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    for (const m of boundsMarkers) bounds.extend(m.position);
    map.fitBounds(bounds, 48);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, boundsMarkers.map((m) => m.event.id).join(","), focusEventIds?.join(",")]);

  const routePlaceIds = useMemo(() => {
    if (!routeEventIds || routeEventIds.length < 2) return null;
    const byId = new Map(events.map((e) => [e.id, e]));
    const ids = routeEventIds.map((id) => byId.get(id)?.maps_place_id).filter((id): id is string => !!id);
    return ids.length >= 2 ? ids : null;
  }, [routeEventIds, events]);

  return (
    <>
      {routePlaceIds && <RoutePath placeIds={routePlaceIds} locations={locations} />}
      {markers.map(({ event, position }) => (
        <AdvancedMarker key={event.id} position={position} onClick={() => onEventClick?.(event)}>
          <Pin
            background={CATEGORY_CONFIG[event.category].hex}
            borderColor="rgba(0,0,0,0.25)"
            glyphColor="rgba(255,255,255,0.9)"
          />
        </AdvancedMarker>
      ))}
    </>
  );
}

interface RouteSegment {
  path: google.maps.LatLngLiteral[];
  mode: TravelMode;
}

function toGoogleTravelMode(mode: TravelMode): google.maps.TravelMode {
  if (mode === "walking") return google.maps.TravelMode.WALKING;
  if (mode === "transit") return google.maps.TravelMode.TRANSIT;
  return google.maps.TravelMode.DRIVING;
}

// Tragitto su strada (Directions API) tra le tappe indicate, in ordine. Una
// singola richiesta con tutti i waypoint fallisce (ZERO_RESULTS) non appena
// una sola tappa non è direttamente raggiungibile in auto — richiediamo
// quindi una tratta alla volta (stessa strategia già usata con successo dal
// tempo di guida per-tappa) e concateniamo i segmenti risolti, saltando solo
// quelli senza percorso invece di perdere l'intero tragitto.
function RoutePath({
  placeIds,
  locations,
}: {
  placeIds: string[];
  locations: Record<string, google.maps.LatLngLiteral | null>;
}) {
  const [segments, setSegments] = useState<(RouteSegment | null)[]>([]);
  const airportLoc = locations[AIRPORT_PLACE_ID];
  const key = placeIds.join(",") + "|" + (airportLoc ? `${airportLoc.lat},${airportLoc.lng}` : "");

  useEffect(() => {
    if (typeof google === "undefined" || !google.maps || placeIds.length < 2) {
      setSegments([]);
      return;
    }

    let cancelled = false;
    const service = new google.maps.DirectionsService();
    const pairs = placeIds.slice(0, -1).map((id, i) => [id, placeIds[i + 1]] as const);

    // Per l'aeroporto usiamo le coordinate esatte già risolte per il marker
    // (non di nuovo il place_id) — altrimenti Directions può agganciare un
    // punto di accesso diverso dal centro del place, e il tragitto a piedi
    // non parte/arriva esattamente dove è disegnato il pin sulla mappa.
    function endpoint(id: string): google.maps.Place {
      if (id === AIRPORT_PLACE_ID && airportLoc) return { location: airportLoc };
      return { placeId: id };
    }

    Promise.all(
      pairs.map(
        ([from, to]) =>
          new Promise<RouteSegment | null>((resolve) => {
            const mode = determineTravelMode(from, to);
            service.route(
              {
                origin: endpoint(from),
                destination: endpoint(to),
                travelMode: toGoogleTravelMode(mode),
              },
              (result, status) => {
                if (status === "OK" && result?.routes[0]) {
                  resolve({ path: result.routes[0].overview_path.map((p) => p.toJSON()), mode });
                } else {
                  resolve(null);
                }
              },
            );
          }),
      ),
    ).then((results) => {
      if (!cancelled) setSegments(results);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const resolvedSegments = segments.filter(
    (s): s is RouteSegment => s !== null && s.path.length > 0,
  );
  if (resolvedSegments.length === 0) return null;

  return (
    <>
      {resolvedSegments.map((segment, i) =>
        segment.mode !== "driving" ? (
          <Polyline
            key={i}
            path={segment.path}
            strokeOpacity={0}
            strokeWeight={4}
            geodesic={false}
            icons={[
              {
                icon: { path: "M 0,-1 0,1", strokeOpacity: 1, scale: 3 },
                offset: "0",
                repeat: "14px",
              },
            ]}
          />
        ) : (
          <Polyline
            key={i}
            path={segment.path}
            strokeColor="#111827"
            strokeOpacity={0.85}
            strokeWeight={4}
            geodesic={false}
          />
        ),
      )}
    </>
  );
}

export default function MapView({
  events,
  onEventClick,
  focusEventIds,
  routeEventIds,
  defaultCenter = SCOTLAND_CENTER,
  defaultZoom = 7,
  className,
}: MapViewProps) {
  if (!env.googleMapsApiKey) {
    return (
      <div
        className={`flex items-center justify-center bg-[var(--bg-elevated)] px-8 text-center text-sm text-[var(--text-muted)] ${className ?? ""}`}
      >
        Mappa non disponibile: manca <code>VITE_GOOGLE_MAPS_API_KEY</code>.
      </div>
    );
  }

  return (
    <GoogleMap
      className={className}
      mapId={env.googleMapsMapId}
      defaultCenter={defaultCenter}
      defaultZoom={defaultZoom}
      disableDefaultUI
      gestureHandling="greedy"
    >
      <MapMarkers
        events={events}
        onEventClick={onEventClick}
        focusEventIds={focusEventIds}
        routeEventIds={routeEventIds}
      />
    </GoogleMap>
  );
}
