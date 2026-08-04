import { useEffect, useMemo, useState } from "react";
import { useTrip } from "@/lib/trip-context";
import { useEvents } from "@/hooks/useEvents";
import { initialSelectedDay, buildDayRouteEventIds } from "@/lib/day";
import MapView from "@/components/MapView";
import EventListItem from "@/components/EventListItem";
import EventDetailSheet from "@/components/EventDetailSheet";
import DrivingTimeConnector from "@/components/DrivingTimeConnector";
import EmptyState from "@/components/EmptyState";
import Skeleton from "@/components/Skeleton";
import type { EventRow } from "@/types/database";

function sortByTime(events: EventRow[]): EventRow[] {
  return [...events].sort((a, b) => {
    if (a.start_time && b.start_time) return a.start_time.localeCompare(b.start_time);
    if (a.start_time) return -1;
    if (b.start_time) return 1;
    return a.name.localeCompare(b.name);
  });
}

export default function OggiPage() {
  const { trip, member } = useTrip();
  const { events, loading } = useEvents(trip?.id ?? null);
  const [now, setNow] = useState(() => new Date());
  const [selectedEvent, setSelectedEvent] = useState<EventRow | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  // La Home mostra sempre "oggi" (o il primo giorno del viaggio se non è
  // ancora iniziato): la navigazione tra i giorni resta su Viaggio/Calendario.
  // Dipende da "now" (già aggiornato ogni 30s sopra) così la pagina passa da
  // sola al giorno successivo a mezzanotte, senza bisogno di un remount.
  const todayIso = useMemo(() => (trip ? initialSelectedDay(trip, now) : ""), [trip, now]);

  const dayEvents = useMemo(
    () => sortByTime(events.filter((e) => e.day === todayIso)),
    [events, todayIso],
  );

  // Il tragitto reale parte dall'alloggio della notte precedente e arriva a
  // quello della notte successiva (vedi buildDayRouteEventIds) — questi
  // possono non essere tra gli eventi "di oggi", quindi vanno aggiunti anche
  // alla lista passata a MapView perché la mappa possa risolverne il pin.
  const routeEventIds = useMemo(
    () => (trip ? buildDayRouteEventIds(dayEvents, events, todayIso, trip) : []),
    [dayEvents, events, todayIso, trip],
  );
  const mapEvents = useMemo(() => {
    const extraIds = routeEventIds.filter((id) => !dayEvents.some((e) => e.id === id));
    if (extraIds.length === 0) return dayEvents;
    const extraSet = new Set(extraIds);
    return [...dayEvents, ...events.filter((e) => extraSet.has(e.id))];
  }, [dayEvents, events, routeEventIds]);

  if (!trip) return null;

  const firstName = member?.display_name?.trim().split(/\s+/)[0] || "viaggiatore";

  return (
    <div className="animate-page flex h-full w-full flex-col overflow-hidden">
      <div className="flex shrink-0 flex-col gap-3 px-5 pt-3 pb-3">
        <p className="text-[28px] leading-[34px] font-bold text-[var(--text)]">
          Biodh latha math agad,
          <br />a {firstName}!
        </p>
        <p className="text-xs font-bold tracking-wide text-[var(--primary)] uppercase">
          Scozia on the road
        </p>
      </div>

      <div className="shrink-0 px-5 pb-4">
        <MapView
          className="h-[346px] w-full overflow-hidden rounded-[20px] border border-[var(--border)]"
          events={mapEvents}
          onEventClick={setSelectedEvent}
          routeEventIds={routeEventIds}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[calc(6rem+env(safe-area-inset-bottom))]">
        <p className="mb-3 text-sm font-bold text-[var(--text)]">PROGRAMMA DI OGGI</p>
        <div className="flex flex-col gap-2">
          {loading && dayEvents.length === 0 && (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-[72px] w-full rounded-[20px]" />
              <Skeleton className="h-[72px] w-full rounded-[20px]" />
            </div>
          )}
          {!loading && dayEvents.length === 0 && (
            <EmptyState
              variant="calendar"
              title="Nessun evento in programma"
              description="Aggiungine uno da Calendario, o goditi un giorno libero."
            />
          )}
          {dayEvents.map((event, i) => {
            const prev = dayEvents[i - 1];
            return (
              <div key={event.id}>
                {prev && (
                  <DrivingTimeConnector fromPlaceId={prev.maps_place_id} toPlaceId={event.maps_place_id} />
                )}
                <EventListItem event={event} now={now} onClick={() => setSelectedEvent(event)} />
              </div>
            );
          })}
        </div>
      </div>

      {selectedEvent && (
        <EventDetailSheet event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      )}
    </div>
  );
}
