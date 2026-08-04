import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, ChevronDown, Eye, EyeOff, Pencil } from "lucide-react";
import clsx from "clsx";
import { useTrip } from "@/lib/trip-context";
import { useEvents } from "@/hooks/useEvents";
import { useToast } from "@/lib/toast-context";
import { enumerateDays, formatDayLong, formatTime, initialSelectedDay } from "@/lib/day";
import { CATEGORY_CONFIG } from "@/lib/categories";
import { computeEventStatus, isEventPast } from "@/lib/event-status";
import EventDetailSheet from "@/components/EventDetailSheet";
import { EventListSkeleton } from "@/components/Skeleton";
import type { EventRow } from "@/types/database";

function sortByTime(events: EventRow[]): EventRow[] {
  return [...events].sort((a, b) => {
    if (a.start_time && b.start_time) return a.start_time.localeCompare(b.start_time);
    if (a.start_time) return -1;
    if (b.start_time) return 1;
    return a.name.localeCompare(b.name);
  });
}

// Riga compatta "pallino + testo" (component Figma "EventRow" / day-items del
// frame Calendario): molto più leggera della card con icona usata in
// Oggi/Viaggio, coerente col fatto che qui la lista può essere lunga.
function CalendarEventRow({
  event,
  now,
  onClick,
}: {
  event: EventRow;
  now: Date;
  onClick: () => void;
}) {
  const config = CATEGORY_CONFIG[event.category];
  const status = computeEventStatus(event, now);
  const time = formatTime(event.start_time) ?? event.start_time_label;
  const past = status !== "saltato" && isEventPast(event, now);

  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "flex w-full items-center gap-2.5 rounded-xl bg-[var(--bg-elevated)] p-3 text-left transition-colors",
        event.status_plan === "facoltativo" && "opacity-70",
      )}
    >
      <span
        className={clsx("h-2 w-2 shrink-0 rounded-full", past && "opacity-50")}
        style={{ background: config.color }}
        aria-hidden
      />
      <span className="min-w-0 flex-1">
        <span
          className={clsx(
            "block truncate text-sm font-semibold text-[var(--text)]",
            status === "saltato" && "line-through opacity-60",
            past && "opacity-70",
          )}
        >
          {event.name}
        </span>
        <span className="mt-0.5 block text-xs text-[var(--text-muted)]">
          {status === "saltato" ? "Saltato" : status === "in_corso" ? "In corso" : time}
          {event.delay_minutes > 0 && (
            <span className="font-semibold text-[var(--text)]"> · +{event.delay_minutes} min</span>
          )}
        </span>
      </span>
    </button>
  );
}

export default function CalendarioPage() {
  const navigate = useNavigate();
  const { trip } = useTrip();
  const { events, loading } = useEvents(trip?.id ?? null);
  const { showToast } = useToast();
  const [showFacoltativi, setShowFacoltativi] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<EventRow | null>(null);
  // Il giorno corrente (o il prossimo, se il viaggio non è ancora iniziato) parte
  // espanso, gli altri chiusi — l'utente può aprirne altri col chevron.
  const [expandedDays, setExpandedDays] = useState<Set<string>>(
    () => new Set(trip ? [initialSelectedDay(trip)] : []),
  );
  // Aggiornato periodicamente (non calcolato una sola volta al mount) così
  // gli stati "In corso"/"vissuta" restano corretti anche se la pagina resta
  // aperta a lungo, invece di restare congelati all'orario di apertura.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const days = useMemo(() => (trip ? enumerateDays(trip) : []), [trip]);

  function toggleDay(day: string) {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  }

  const visibleEvents = useMemo(
    () => events.filter((e) => showFacoltativi || e.status_plan === "nel_piano"),
    [events, showFacoltativi],
  );

  const eventsByDay = useMemo(() => {
    const map = new Map<string, EventRow[]>();
    for (const e of visibleEvents) {
      const key = e.day ?? "__unassigned";
      const list = map.get(key) ?? [];
      list.push(e);
      map.set(key, list);
    }
    return map;
  }, [visibleEvents]);

  const unassigned = sortByTime(eventsByDay.get("__unassigned") ?? []);

  if (!trip) return null;

  // "Aggiungere" per specifica (04-ai-assistant.md, Flusso 1) passa dalla
  // ricerca web + preview dell'assistente AI: finché non è implementato
  // (task dedicato, da approvare separatamente) questo è uno stub.
  function handleAddEvent() {
    showToast("Aggiunta evento: disponibile con l'assistente AI (prossimo step)");
  }

  return (
    <div className="animate-page relative flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between px-5 pt-3 pb-4">
        <h1 className="text-[28px] leading-[34px] font-bold text-[var(--text)]">Il piano</h1>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setShowFacoltativi((v) => !v)}
            className="rounded-full p-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--border)]"
            aria-pressed={showFacoltativi}
            aria-label={showFacoltativi ? "Nascondi attività facoltative" : "Mostra attività facoltative"}
            title={showFacoltativi ? "Nascondi attività facoltative" : "Mostra attività facoltative"}
          >
            {showFacoltativi ? <Eye size={20} /> : <EyeOff size={20} />}
          </button>
          <button
            type="button"
            onClick={() => navigate(`/viaggio/${initialSelectedDay(trip)}/modifica`)}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--primary-soft)] bg-[var(--bg)] px-3 py-2 text-[13px] font-semibold text-[var(--primary)] transition-colors hover:bg-[var(--primary-soft)]"
          >
            <Pencil size={14} /> Modifica
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[calc(6rem+env(safe-area-inset-bottom))]">
        {loading && <EventListSkeleton />}

        {unassigned.length > 0 && (
          <section className="mb-4">
            <h2 className="mb-2 text-xs font-bold text-[var(--primary)] uppercase">
              Giorno da assegnare
            </h2>
            <div className="flex flex-col gap-1.5">
              {unassigned.map((event) => (
                <CalendarEventRow
                  key={event.id}
                  event={event}
                  now={now}
                  onClick={() => setSelectedEvent(event)}
                />
              ))}
            </div>
          </section>
        )}

        {days.map((day) => {
          const dayEvents = sortByTime(eventsByDay.get(day) ?? []);
          if (dayEvents.length === 0) return null;
          const isExpanded = expandedDays.has(day);
          return (
            <section key={day} className="mb-4">
              <div className="mb-2 flex w-full items-center justify-between gap-2">
                {/* Il testo del giorno naviga al Dettaglio Giorno (come nel Figma
                    aggiornato, "day-header-row" è un link); il chevron resta un
                    bottone separato per non perdere il toggle espandi/comprimi
                    già esistente dell'accordion. */}
                <button
                  type="button"
                  onClick={() => navigate(`/viaggio/${day}`)}
                  className="text-left text-xs font-bold text-[var(--primary)] uppercase"
                >
                  {formatDayLong(day)}
                </button>
                <button
                  type="button"
                  onClick={() => toggleDay(day)}
                  className="shrink-0 rounded-full p-1 text-[var(--primary)] transition-colors hover:bg-[var(--primary-soft)]"
                  aria-expanded={isExpanded}
                  aria-label={isExpanded ? "Comprimi giorno" : "Espandi giorno"}
                >
                  <ChevronDown
                    size={16}
                    className={clsx("transition-transform", isExpanded && "rotate-180")}
                  />
                </button>
              </div>
              {isExpanded && (
                <div className="flex flex-col gap-1.5">
                  {dayEvents.map((event) => (
                    <CalendarEventRow
                      key={event.id}
                      event={event}
                      now={now}
                      onClick={() => setSelectedEvent(event)}
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>

      <button
        type="button"
        onClick={handleAddEvent}
        className="absolute right-5 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] flex h-14 w-14 items-center justify-center rounded-full bg-[var(--primary)] text-white shadow-lg"
        aria-label="Aggiungi evento"
      >
        <Plus size={26} />
      </button>

      {selectedEvent && (
        <EventDetailSheet event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      )}
    </div>
  );
}
