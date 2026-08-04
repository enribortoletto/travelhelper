import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { useTrip } from "@/lib/trip-context";
import { useEvents } from "@/hooks/useEvents";
import { useDrivingDetails } from "@/hooks/useDrivingTime";
import { TRAVEL_MODE_ICON, TRAVEL_MODE_LABEL } from "@/lib/travel-mode";
import { formatDayLong, formatTime, shiftTime, isTimeAfter, buildDayRouteEventIds, getDayRouteAnchors } from "@/lib/day";
import { CATEGORY_CONFIG, categoryBadgeStyle } from "@/lib/categories";
import MapView from "@/components/MapView";
import EventDetailSheet from "@/components/EventDetailSheet";
import EmptyState from "@/components/EmptyState";
import type { EventRow } from "@/types/database";

const CHECKIN_MINUTES = 30;

function sortByTime(events: EventRow[]): EventRow[] {
  return [...events].sort((a, b) => {
    if (a.start_time && b.start_time) return a.start_time.localeCompare(b.start_time);
    if (a.start_time) return -1;
    if (b.start_time) return 1;
    return a.name.localeCompare(b.name);
  });
}

interface ListItem {
  key: string;
  event: EventRow;
  /**
   * - "departure": alloggio della notte precedente, mostrato solo come ora di
   *   partenza (non l'orario di arrivo della sera prima).
   * - "checkin": check-in fatto prima che finiscano le attività del giorno
   *   (es. prima di cena) — 30 min fissi, poi la giornata continua.
   * - "finalArrival": l'arrivo per dormire, sempre l'ultima tappa del giorno.
   */
  role?: "departure" | "checkin" | "finalArrival";
}

// Riga "timeline-item": nome, orario di arrivo E di partenza (tranne rispettivamente
// per la prima e l'ultima tappa del giorno), riga meta con icona+tempo+modalità di
// spostamento (auto/piedi/mezzi pubblici) verso la tappa successiva, badge categoria.
function TimelineRow({
  event,
  next,
  onClick,
  role,
}: {
  event: EventRow;
  next: EventRow | null;
  onClick: () => void;
  role?: ListItem["role"];
}) {
  const config = CATEGORY_CONFIG[event.category];
  const toNext = useDrivingDetails(event.maps_place_id, next?.maps_place_id ?? null);

  // "realArrival" è un vero orario HH:MM calcolato da event.start_time — a
  // differenza di "arrival", che può anche essere un'etichetta testuale
  // libera (event.start_time_label, es. "da verificare") quando non c'è un
  // orario preciso. Solo il primo può essere passato a shiftTime(): l'altro
  // non è un orario e produrrebbe "NaN:NaN".
  const realArrival = formatTime(event.start_time);

  let displayName = event.name;
  let arrival: string | null = realArrival ?? event.start_time_label;
  let departure: string | null = null;
  let anchorLabel: string | undefined;

  if (role === "departure") {
    anchorLabel = "Partenza";
    const originalTime = arrival;
    arrival = null;
    departure = next?.start_time && toNext ? shiftTime(next.start_time, -toNext.seconds) : originalTime;
  } else if (role === "checkin") {
    displayName = `Check-in ${event.name}`;
    departure = realArrival ? shiftTime(realArrival, CHECKIN_MINUTES * 60) : null;
  } else if (role === "finalArrival") {
    anchorLabel = "Arrivo";
    departure = null;
  } else {
    // Tappa normale: la partenza è l'ora in cui bisogna lasciare questa tappa
    // per arrivare puntuali alla prossima (calcolata a ritroso dal suo orario
    // di arrivo), non solo un testo di durata.
    departure =
      next?.start_time && toNext
        ? shiftTime(next.start_time, -toNext.seconds)
        : (formatTime(event.end_time) ?? (realArrival ? shiftTime(realArrival, 3600) : null));
  }

  const hours =
    !role && event.opening_hours && "raw" in event.opening_hours ? String(event.opening_hours.raw) : null;
  const ModeIcon = toNext ? TRAVEL_MODE_ICON[toNext.mode] : null;
  const nextLabel = toNext
    ? `${toNext.text} ${TRAVEL_MODE_LABEL[toNext.mode]}${next ? ` verso ${next.name}` : ""}`
    : null;

  const timeLabel = [arrival, departure].filter(Boolean).join(" – ") || null;

  return (
    <button
      type="button"
      onClick={onClick}
      className={
        anchorLabel
          ? "w-full rounded-xl border border-dashed border-[var(--border)] bg-[var(--border)]/20 p-2.5 text-left opacity-80"
          : "w-full text-left"
      }
    >
      {anchorLabel && (
        <p className="mb-1 text-[10px] font-bold tracking-wide text-[var(--text-muted)] uppercase">
          {anchorLabel}
        </p>
      )}
      <div className="flex items-baseline justify-between gap-2">
        <p className="truncate text-sm font-semibold text-[var(--text)]">{displayName}</p>
        {timeLabel && (
          <span className="shrink-0 text-sm font-semibold" style={{ color: config.color }}>
            {timeLabel}
          </span>
        )}
      </div>
      {(hours || nextLabel) && (
        <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-[var(--text-muted)]">
          {hours && <span className="truncate">{hours}</span>}
          {hours && nextLabel && <span>·</span>}
          {nextLabel && (
            <span className="flex items-center gap-1 truncate">
              {ModeIcon && <ModeIcon size={12} className="shrink-0" />}
              {nextLabel}
            </span>
          )}
        </p>
      )}
      <span
        className="mt-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium whitespace-nowrap"
        style={categoryBadgeStyle(event.category)}
      >
        {config.label}
      </span>
    </button>
  );
}

export default function DayDetailPage() {
  const { day } = useParams<{ day: string }>();
  const navigate = useNavigate();
  const { trip } = useTrip();
  const { events } = useEvents(trip?.id ?? null);
  const [selectedEvent, setSelectedEvent] = useState<EventRow | null>(null);

  const dayEvents = useMemo(
    () => (day ? sortByTime(events.filter((e) => e.day === day)) : []),
    [events, day],
  );

  // Il tragitto sulla mappa parte dall'alloggio della notte precedente e
  // arriva a quello della notte successiva (vedi buildDayRouteEventIds) —
  // questi possono non essere tra gli eventi del giorno, quindi vanno
  // aggiunti anche alla lista passata a MapView perché possa risolverne il pin.
  const routeEventIds = useMemo(
    () => (trip && day ? buildDayRouteEventIds(dayEvents, events, day, trip) : []),
    [dayEvents, events, day, trip],
  );
  const mapEvents = useMemo(() => {
    const extraIds = routeEventIds.filter((id) => !dayEvents.some((e) => e.id === id));
    if (extraIds.length === 0) return dayEvents;
    const extraSet = new Set(extraIds);
    return [...dayEvents, ...events.filter((e) => extraSet.has(e.id))];
  }, [dayEvents, events, routeEventIds]);

  const { prevNightId, nextNightId } = useMemo(
    () => (trip && day ? getDayRouteAnchors(dayEvents, events, day, trip) : { prevNightId: null, nextNightId: null }),
    [dayEvents, events, day, trip],
  );

  const hotel = useMemo(
    () => (nextNightId ? (dayEvents.find((e) => e.id === nextNightId) ?? null) : null),
    [dayEvents, nextNightId],
  );

  // Ultima attività del giorno con un orario reale (esclude l'alloggio stesso
  // e le tappe facoltative senza orario, che altrimenti finirebbero per
  // "precedere" l'arrivo finale solo perché ordinate per ultime): serve per
  // calcolare l'orario dell'arrivo finale quando l'alloggio è stato "sdoppiato".
  const lastTimedActivity = useMemo(() => {
    const timed = dayEvents.filter((e) => e.id !== nextNightId && e.start_time);
    return timed.length > 0 ? timed[timed.length - 1] : null;
  }, [dayEvents, nextNightId]);

  // Orario di rientro reale all'alloggio (arrivo finale), calcolato UNA volta
  // qui — non dentro alla singola riga — così che anche la tappa precedente
  // (che mostra "verso {alloggio}" come prossima destinazione) veda l'orario
  // corretto invece dell'orario di check-in registrato sull'evento originale.
  const fromLastToHotel = useDrivingDetails(lastTimedActivity?.maps_place_id ?? null, hotel?.maps_place_id ?? null);
  const finalArrivalTime = useMemo(() => {
    if (!hotel) return null;
    const prevEnd =
      lastTimedActivity?.end_time ?? (lastTimedActivity?.start_time ? shiftTime(lastTimedActivity.start_time, 3600) : null);
    const computed = prevEnd && fromLastToHotel ? shiftTime(prevEnd, fromLastToHotel.seconds) : null;
    if (computed && (!hotel.start_time || isTimeAfter(computed, hotel.start_time))) return computed;
    return formatTime(hotel.start_time) ?? hotel.start_time_label ?? null;
  }, [hotel, lastTimedActivity, fromLastToHotel]);

  // Lista per l'Itinerario Dettagliato: a differenza del tragitto sulla
  // mappa, qui l'alloggio della notte precedente resta solo in apertura (con
  // l'orario di partenza) e quello della notte successiva compare SEMPRE come
  // ultima tappa. Se il check-in registrato è più presto di quando finiscono
  // davvero le attività (es. prima di cena), l'alloggio compare due volte:
  // una per il check-in vero e proprio (30 min, nella sua posizione naturale)
  // e una come arrivo finale della serata (sempre l'ultima tappa).
  const listItems = useMemo<ListItem[]>(() => {
    if (!trip || !day) return [];
    const items: ListItem[] = [];

    if (prevNightId) {
      const prevHotel = events.find((e) => e.id === prevNightId);
      if (prevHotel) items.push({ key: prevHotel.id, event: prevHotel, role: "departure" });
    }

    const finalArrivalEvent = (e: EventRow): EventRow => ({
      ...e,
      start_time: finalArrivalTime,
      start_time_label: finalArrivalTime ? null : e.start_time_label,
    });

    const needsSplit =
      !!hotel?.start_time &&
      dayEvents.some((e) => e.id !== hotel.id && !!e.start_time && isTimeAfter(e.start_time!, hotel.start_time!));

    for (const event of dayEvents) {
      if (hotel && event.id === hotel.id) {
        // L'arrivo finale non viene mai messo qui "in posizione naturale":
        // eventi facoltativi senza orario (che ordinano sempre in coda,
        // vedi sortByTime) potrebbero finire dopo l'alloggio nell'array pur
        // non avendo un vero orario successivo — l'arrivo finale va sempre
        // aggiunto esplicitamente come ultimissima tappa, sotto.
        if (needsSplit) items.push({ key: `${event.id}-checkin`, event, role: "checkin" });
        continue;
      }
      items.push({ key: event.id, event });
    }

    if (hotel) {
      items.push({ key: `${hotel.id}-arrival`, event: finalArrivalEvent(hotel), role: "finalArrival" });
    }

    return items;
  }, [trip, day, dayEvents, events, prevNightId, hotel, finalArrivalTime]);

  if (!trip || !day) return null;

  return (
    <div className="animate-page flex h-full flex-col overflow-hidden">
      <div className="relative flex shrink-0 items-center border-b border-[var(--border)] px-4 py-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="absolute left-4 shrink-0 rounded-full p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--border)]"
          aria-label="Indietro"
        >
          <ChevronLeft size={20} />
        </button>
        <h1 className="w-full truncate px-10 text-center text-sm font-semibold text-[var(--text)] capitalize">
          {formatDayLong(day)}
        </h1>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-[calc(6rem+env(safe-area-inset-bottom))]">
        <div className="p-4 pb-5">
          <div className="h-[300px] w-full overflow-hidden rounded-2xl border border-[var(--border)] shadow-card">
            <MapView
              className="h-full w-full"
              events={mapEvents}
              routeEventIds={routeEventIds}
              onEventClick={setSelectedEvent}
            />
          </div>
        </div>

        <div className="px-4 pb-6">
          <h2 className="mb-3 text-xs font-bold tracking-wide text-[var(--text)] uppercase">
            Itinerario dettagliato
          </h2>

          {listItems.length === 0 ? (
            <EmptyState
              variant="calendar"
              title="Nessuna tappa"
              description="Non ci sono eventi pianificati per questo giorno."
            />
          ) : (
            <div className="flex flex-col">
              {listItems.map((item, i) => {
                const isLast = i === listItems.length - 1;
                const config = CATEGORY_CONFIG[item.event.category];
                return (
                  <div key={item.key} className="flex gap-3">
                    <div className="flex flex-col items-center pt-1">
                      <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: config.color }} />
                      {!isLast && <span className="mt-1 w-0.5 flex-1 bg-[var(--border)]" />}
                    </div>
                    <div className="min-w-0 flex-1 pb-5">
                      <TimelineRow
                        event={item.event}
                        next={isLast ? null : listItems[i + 1].event}
                        onClick={() => setSelectedEvent(item.event)}
                        role={item.role}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {selectedEvent && <EventDetailSheet event={selectedEvent} onClose={() => setSelectedEvent(null)} />}
    </div>
  );
}
