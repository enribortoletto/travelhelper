import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTrip } from "@/lib/trip-context";
import { useEvents } from "@/hooks/useEvents";
import { useTripDays } from "@/hooks/useTripDays";
import { enumerateDays } from "@/lib/day";
import { computeTripProgress, computeStopsProgress } from "@/lib/trip-stats";
import DayCard from "@/components/DayCard";
import TripStatsHeader from "@/components/TripStatsHeader";
import TripPathProgress from "@/components/TripPathProgress";
import type { EventRow } from "@/types/database";

export default function ViaggioPage() {
  const navigate = useNavigate();
  const { trip } = useTrip();
  const { events } = useEvents(trip?.id ?? null);
  const { tripDays } = useTripDays(trip?.id ?? null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const days = useMemo(() => (trip ? enumerateDays(trip) : []), [trip]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, EventRow[]>();
    for (const e of events) {
      if (!e.day) continue;
      const list = map.get(e.day) ?? [];
      list.push(e);
      map.set(e.day, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.start_time ?? "99").localeCompare(b.start_time ?? "99"));
    }
    return map;
  }, [events]);

  const tripDayByDay = useMemo(() => {
    const map = new Map<string, (typeof tripDays)[number]>();
    for (const td of tripDays) map.set(td.day, td);
    return map;
  }, [tripDays]);

  // Tappa principale reale di ogni giorno per la barra di percorso: l'alloggio
  // della notte, o in mancanza la prima tappa in ordine orario — mai dati
  // finti stile EDI/AVI/WIC del mockup Figma.
  const stopNameByDay = useMemo(() => {
    const overnight = new Map(
      events.filter((e) => e.category === "alloggio" && e.day).map((e) => [e.day!, e.name]),
    );
    const firstStopByDay = new Map<string, string>();
    const sorted = [...events]
      .filter((e) => e.day && e.category !== "alloggio")
      .sort((a, b) => (a.start_time ?? "99").localeCompare(b.start_time ?? "99"));
    for (const e of sorted) {
      if (!firstStopByDay.has(e.day!)) firstStopByDay.set(e.day!, e.name);
    }
    const map = new Map<string, string>();
    for (const day of days) {
      map.set(day, overnight.get(day) ?? firstStopByDay.get(day) ?? "");
    }
    return map;
  }, [events, days]);

  if (!trip) return null;

  const progress = computeTripProgress(trip);
  // Fraction "reale" della barra di percorso: quante tappe sono già state
  // fatte rispetto al punto del viaggio in cui ci si trova ora (stessa
  // logica della card "Tappe fatte"), non solo l'indice del giorno.
  const stopsProgress = computeStopsProgress(events, trip);

  return (
    <div className="animate-page flex h-full flex-col overflow-hidden">
      {/* Header fisso (sezione "stage-progress" del Figma): titolo del
          viaggio + bandiera, sopra al contenuto scrollabile. */}
      <div className="flex shrink-0 items-center gap-3 px-5 pt-3 pb-1">
        <h1 className="w-[222px] shrink-0 text-[28px] leading-[34px] font-bold text-[var(--text)]">
          Conquista le Highlands
        </h1>
        <span className="flex-1 text-center text-[64px] leading-none" aria-hidden>
          🏴󠁧󠁢󠁳󠁣󠁴󠁿
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-[calc(6rem+env(safe-area-inset-bottom))]">
        {/* Sticky: resta visibile durante tutto lo scroll (anche oltre le
            stat-card), così il giorno selezionabile è sempre a portata di tap. */}
        <div className="sticky top-0 z-10 bg-[var(--bg)] px-5 pt-3 pb-3">
          <TripPathProgress
            days={days}
            stopNameByDay={stopNameByDay}
            progress={progress}
            progressFraction={stopsProgress.fraction}
            selectedDay={selectedDay}
            onSelectDay={(day) => {
              setSelectedDay((prev) => (prev === day ? null : day));
              document.getElementById(`giorno-${day}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          />
        </div>

        <TripStatsHeader trip={trip} events={events} days={days} />

        <div className="flex flex-col gap-3 px-5 pb-5">
          {days.map((day, i) => {
            const dayEvents = eventsByDay.get(day) ?? [];
            const overnightEvent = dayEvents.find((e) => e.category === "alloggio") ?? null;
            const stops = dayEvents.filter((e) => e.category !== "alloggio");

            return (
              <DayCard
                key={day}
                id={`giorno-${day}`}
                day={day}
                dayIndex={i + 1}
                summary={tripDayByDay.get(day)?.summary ?? null}
                overnightEvent={overnightEvent}
                stops={stops}
                selected={selectedDay === day}
                onClick={() => navigate(`/viaggio/${day}`)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
