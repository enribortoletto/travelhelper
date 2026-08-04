import { useMemo, useState } from "react";
import { Flag, Clock } from "lucide-react";
import { computeStopsProgress, consecutivePlacePairs } from "@/lib/trip-stats";
import TravelHoursStat from "./TravelHoursStat";
import type { EventRow, TripRow } from "@/types/database";

interface TripStatsHeaderProps {
  trip: TripRow;
  events: EventRow[];
  days: string[];
}

// Card statistica con barra di avanzamento reale che sale dal basso
// (struttura "stat-card" dell'altimetry/stats-row del Figma): icona in alto,
// valore + unità, etichetta sotto — l'accento riempie da 0 (niente, in
// basso) a 100% (l'intero blocco, fino in cima) in base a "fraction", il
// vero progresso rispetto al punto del viaggio in cui ci si trova.
function StatCard({
  icon,
  fraction,
  children,
}: {
  icon: React.ReactNode;
  fraction: number;
  children: React.ReactNode;
}) {
  const height = `${Math.max(0, Math.min(1, fraction)) * 100}%`;
  return (
    <div className="relative flex-1 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 shadow-card">
      <div
        className="absolute inset-x-0 bottom-0 bg-[var(--progress-fill)] transition-[height] duration-500"
        style={{ height }}
        aria-hidden
      />
      <div className="relative flex flex-col items-start gap-2.5">
        <span className="text-[var(--text)]">{icon}</span>
        {children}
      </div>
    </div>
  );
}

export default function TripStatsHeader({ trip, events, days }: TripStatsHeaderProps) {
  const pairs = consecutivePlacePairs(events, days);
  const stopsProgress = useMemo(() => computeStopsProgress(events, trip), [events, trip]);
  const [drivingFraction, setDrivingFraction] = useState(0);

  return (
    <div className="flex gap-2 px-5 pb-4">
      <StatCard icon={<Flag size={24} />} fraction={stopsProgress.fraction}>
        <div className="flex items-baseline gap-1.5">
          <span className="text-sm font-semibold text-[var(--text)]">{stopsProgress.done}</span>
          <span className="text-sm font-medium text-[var(--text)]">/ {stopsProgress.total} tappe</span>
        </div>
        <p className="text-sm font-medium text-[var(--text)]">Tappe fatte</p>
      </StatCard>
      <StatCard icon={<Clock size={24} />} fraction={drivingFraction}>
        <TravelHoursStat pairs={pairs} trip={trip} onFractionChange={setDrivingFraction} />
      </StatCard>
    </div>
  );
}
