import { useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ChevronLeft, GripVertical } from "lucide-react";
import clsx from "clsx";
import { useTrip } from "@/lib/trip-context";
import { useEvents } from "@/hooks/useEvents";
import { useStubbedAiActions } from "@/hooks/useStubbedAiActions";
import { enumerateDays, formatDayLong, toIsoDay } from "@/lib/day";
import { CATEGORY_CONFIG } from "@/lib/categories";
import type { EventRow } from "@/types/database";

function sortByTime(events: EventRow[]): EventRow[] {
  return [...events].sort((a, b) => {
    if (a.start_time && b.start_time) return a.start_time.localeCompare(b.start_time);
    if (a.start_time) return -1;
    if (b.start_time) return 1;
    return a.name.localeCompare(b.name);
  });
}

// Riga "itinerary-row" del Figma "compact-planner": orario editabile (input
// time, salvataggio stub) + nome + pallino categoria. Il grip di riordino è
// mostrato solo per i giorni non ancora passati, coerentemente col fatto che
// nel Figma le sezioni già passate (opacità ridotta) non hanno la maniglia di
// drag — non ha senso riordinare un giorno già vissuto.
function ItineraryRow({
  event,
  dayPast,
  onReorder,
  onChangeTime,
}: {
  event: EventRow;
  dayPast: boolean;
  onReorder: () => void;
  onChangeTime: () => void;
}) {
  const config = CATEGORY_CONFIG[event.category];

  return (
    <div
      className={clsx(
        "flex h-10 w-full items-center gap-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] py-2 pr-3.5 pl-2.5 shadow-card",
        dayPast && "opacity-40",
      )}
    >
      {!dayPast && (
        <button
          type="button"
          onClick={onReorder}
          className="shrink-0 text-[var(--text-muted)]"
          aria-label="Riordina tappa"
        >
          <GripVertical size={16} />
        </button>
      )}
      <input
        type="time"
        disabled={dayPast}
        defaultValue={event.start_time?.slice(0, 5) ?? ""}
        onChange={onChangeTime}
        className="w-[92px] shrink-0 border-0 bg-transparent p-0 text-[13px] font-semibold text-[var(--text-muted)] outline-none disabled:opacity-100"
      />
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--text)]">
        {event.name}
      </span>
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ background: config.color }}
        aria-hidden
      />
    </div>
  );
}

export default function CompactPlannerPage() {
  const { day: originDay } = useParams<{ day: string }>();
  const navigate = useNavigate();
  const { trip } = useTrip();
  const { events } = useEvents(trip?.id ?? null);
  const ai = useStubbedAiActions();

  const todayIso = useMemo(() => toIsoDay(new Date()), []);
  const days = useMemo(() => (trip ? enumerateDays(trip) : []), [trip]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, EventRow[]>();
    for (const e of events) {
      if (!e.day) continue;
      const list = map.get(e.day) ?? [];
      list.push(e);
      map.set(e.day, list);
    }
    for (const [key, list] of map) map.set(key, sortByTime(list));
    return map;
  }, [events]);

  // Scorre fino al giorno da cui si è aperto il planner (pulsante "Modifica"
  // del Dettaglio Giorno), così l'utente ritrova subito il contesto.
  useEffect(() => {
    if (!originDay) return;
    document.getElementById(`planner-day-${originDay}`)?.scrollIntoView({ block: "start" });
  }, [originDay]);

  if (!trip) return null;

  return (
    <div className="animate-page relative flex h-full flex-col overflow-hidden">
      {/* Header (Figma "compact-planner"): back / titolo centrato / Salva —
          stesso pattern a pillola del pulsante Modifica del Dettaglio Giorno. */}
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="shrink-0 rounded-full p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--border)]"
          aria-label="Indietro"
        >
          <ChevronLeft size={20} />
        </button>
        <h1 className="min-w-0 flex-1 truncate text-center text-sm font-semibold text-[var(--text)]">
          Pianificazione rapida
        </h1>
        <button
          type="button"
          onClick={ai.save}
          className="ml-3 shrink-0 rounded-full border border-[var(--primary-soft)] bg-[var(--bg)] px-3 py-2 text-[13px] font-semibold text-[var(--primary)] transition-colors hover:bg-[var(--primary-soft)]"
        >
          Salva
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-2 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <div className="flex flex-col gap-3">
          {days.map((day) => {
            const dayEvents = eventsByDay.get(day) ?? [];
            if (dayEvents.length === 0) return null;
            const dayPast = day < todayIso;
            return (
              <section
                key={day}
                id={`planner-day-${day}`}
                className={clsx("flex flex-col gap-1", dayPast && "opacity-40")}
              >
                <h2 className="pt-3.5 pb-1.5 text-xs font-bold text-[var(--primary)] capitalize">
                  {formatDayLong(day)}
                </h2>
                <div className="flex flex-col gap-1">
                  {dayEvents.map((event) => (
                    <ItineraryRow
                      key={event.id}
                      event={event}
                      dayPast={dayPast}
                      onReorder={ai.reorder}
                      onChangeTime={ai.changeTime}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={ai.add}
        className="absolute right-5 bottom-[calc(1.25rem+env(safe-area-inset-bottom))] flex h-14 w-14 items-center justify-center rounded-full bg-[var(--primary)] text-white shadow-lg"
        aria-label="Aggiungi tappa"
      >
        <span className="text-2xl leading-none">+</span>
      </button>
    </div>
  );
}
