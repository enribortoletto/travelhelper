import { useMemo } from "react";
import clsx from "clsx";
import { formatDayLong } from "@/lib/day";
import { usePlaceDetails } from "@/hooks/usePlaceDetails";
import { consecutivePlacePairs } from "@/lib/trip-stats";
import DayStatsRow from "./DayStatsRow";
import type { EventRow } from "@/types/database";

interface DayCardProps {
  id?: string;
  day: string;
  dayIndex: number;
  summary: string | null;
  overnightEvent: EventRow | null;
  stops: EventRow[];
  selected: boolean;
  onClick: () => void;
}

export default function DayCard({
  id,
  day,
  dayIndex,
  summary,
  overnightEvent,
  stops,
  selected,
  onClick,
}: DayCardProps) {
  const fallbackSummary =
    stops.length > 0
      ? `Tappe principali: ${stops.map((s) => s.name).join(", ")}.`
      : "Nessuna tappa fissata per questo giorno.";

  // Foto hero: prima tappa "attività" o "tappa" del giorno, stessa fonte
  // (Places API) usata da EventDetailSheet — nessuna nuova dipendenza.
  const heroCandidate = useMemo(
    () => stops.find((s) => s.category === "attivita" || s.category === "tappa") ?? null,
    [stops],
  );
  const heroDetails = usePlaceDetails(heroCandidate?.maps_place_id ?? null);

  // Coppie consecutive del giorno (stessa logica di trip-stats.ts, solo
  // ristretta a questo giorno) per la riga km/tempo di guida.
  const dayAllEvents = useMemo(
    () => (overnightEvent ? [...stops, overnightEvent] : stops),
    [stops, overnightEvent],
  );
  const pairs = useMemo(() => consecutivePlacePairs(dayAllEvents, [day]), [dayAllEvents, day]);

  return (
    <button
      id={id}
      type="button"
      onClick={onClick}
      className={clsx(
        "flex w-full scroll-mt-[136px] flex-col gap-1.5 overflow-hidden rounded-2xl border bg-[var(--bg-elevated)] text-left shadow-card transition-colors",
        selected ? "border-[var(--primary)] ring-1 ring-[var(--primary)]" : "border-[var(--border)]",
      )}
    >
      {heroDetails?.photoUrl && (
        <div className="relative h-50 w-full shrink-0 overflow-hidden">
          <img src={heroDetails.photoUrl} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/40" />
        </div>
      )}

      <div
        className={clsx(
          "flex flex-col gap-1.5 px-3.5 pb-3.5",
          !heroDetails?.photoUrl && "pt-3.5",
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-semibold text-[var(--text)] capitalize">
            {formatDayLong(day)}
          </p>
          <span className="shrink-0 rounded-md bg-[var(--primary-soft)] px-2 py-1 text-[10px] font-bold whitespace-nowrap text-[var(--primary)] uppercase">
            Giorno {dayIndex}
          </span>
        </div>

        {overnightEvent && (
          <p className="truncate text-xs text-[var(--text)]">🏨 {overnightEvent.name}</p>
        )}

        <p className="text-sm leading-5 text-pretty text-[var(--text)]">{summary ?? fallbackSummary}</p>

        <DayStatsRow pairs={pairs} stopsCount={stops.length} />
      </div>
    </button>
  );
}
