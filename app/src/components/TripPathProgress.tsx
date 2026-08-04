import { shortStopLabel } from "@/lib/trip-stats";
import type { TripProgress } from "@/lib/trip-stats";

interface TripPathProgressProps {
  days: string[];
  /** Nome reale dell'hotel/tappa principale di ogni giorno (categoria "alloggio", o prima tappa come fallback). */
  stopNameByDay: Map<string, string>;
  progress: TripProgress;
  progressFraction: number;
  selectedDay: string | null;
  onSelectDay: (day: string) => void;
}

/**
 * Versione "senza dati di elevazione" dell'altimetry-section del Figma:
 * niente profilo altimetrico (nessuna Elevation API, nessuna nuova
 * dipendenza di charting), solo una barra di avanzamento del percorso con
 * un marker per ogni giorno, posizionato in base alle tappe/hotel reali del
 * viaggio invece delle sigle aeroportuali del mockup.
 */
export default function TripPathProgress({
  days,
  stopNameByDay,
  progress,
  progressFraction,
  selectedDay,
  onSelectDay,
}: TripPathProgressProps) {
  if (days.length === 0) return null;

  // Indice (0-based) del giorno "corrente" dentro l'array "days", derivato
  // dalla stessa "progress" già calcolata dal chiamante — non da un nuovo
  // Date.now() qui dentro, per restare un'unica fonte di verità coerente con
  // la frazione della linea e con le altre card basate su "progress".
  // -1 = prima del viaggio (nessun giorno ancora passato/corrente);
  // days.length = dopo il viaggio (tutti i giorni già passati).
  const todayIndex =
    progress.phase === "during" ? (progress.dayIndex ?? 1) - 1 : progress.phase === "after" ? days.length : -1;

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4 shadow-card">
      {/* Track + marker, un elemento per giorno in colonne uguali come nel design Figma */}
      <div className="relative h-2">
        <div className="absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 rounded-full bg-[var(--border)]" />
        <div
          className="absolute inset-y-0 left-0 top-1/2 h-[2px] -translate-y-1/2 rounded-full bg-[var(--primary)] transition-all"
          style={{ width: `${Math.round(progressFraction * 100)}%` }}
        />
        <div className="absolute inset-0 flex items-center">
          {days.map((day, index) => {
            const isPast = index < todayIndex;
            const isToday = index === todayIndex;
            const isSelected = selectedDay === day;
            const filled = isPast || isToday;
            return (
              <button
                key={day}
                type="button"
                onClick={() => onSelectDay(day)}
                aria-label={`Vai al giorno ${day}`}
                className="flex h-5 flex-1 items-center justify-center"
              >
                <span
                  className="block rounded-full transition-all"
                  style={{
                    width: isToday ? 10 : 8,
                    height: isToday ? 10 : 8,
                    background: filled ? "var(--primary)" : "var(--bg-elevated)",
                    border: filled ? "none" : "1.5px solid var(--border)",
                    boxShadow: isToday
                      ? "0 0 0 3px color-mix(in srgb, var(--primary) 25%, transparent)"
                      : isSelected
                        ? "0 0 0 2px color-mix(in srgb, var(--primary) 35%, transparent)"
                        : "none",
                  }}
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* Etichette brevi (sigla città/hotel reale) sotto ogni marker */}
      <div className="mt-2 flex items-start">
        {days.map((day, index) => {
          const isToday = index === todayIndex;
          const label = shortStopLabel(stopNameByDay.get(day));
          return (
            <button
              key={day}
              type="button"
              onClick={() => onSelectDay(day)}
              className="min-w-0 flex-1 text-center"
            >
              <span
                className={
                  "block truncate text-[10px] font-semibold " +
                  (isToday ? "text-[var(--primary)]" : "text-[var(--text-muted)] font-normal")
                }
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
