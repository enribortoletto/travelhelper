import { useCallback, useEffect, useState } from "react";
import { useDrivingDetails } from "@/hooks/useDrivingTime";

interface PairValue {
  seconds: number;
  distanceMeters: number;
}

interface PairProbeProps {
  pairKey: string;
  from: string;
  to: string;
  onValue: (key: string, value: PairValue | null) => void;
}

function PairProbe({ pairKey, from, to, onValue }: PairProbeProps) {
  const result = useDrivingDetails(from, to);
  useEffect(() => {
    onValue(pairKey, result ? { seconds: result.seconds, distanceMeters: result.distanceMeters } : null);
  }, [pairKey, result, onValue]);
  return null;
}

function formatDuration(totalSeconds: number): string {
  const totalMinutes = Math.round(totalSeconds / 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

function StatChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex shrink-0 items-center gap-1 rounded-md bg-[var(--bg)] p-1 text-[11px] font-medium whitespace-nowrap text-[var(--text-muted)]">
      {children}
    </span>
  );
}

interface DayStatsRowProps {
  /** Coppie di tappe consecutive dello stesso giorno con place_id (da consecutivePlacePairs). */
  pairs: { key: string; from: string; to: string }[];
  stopsCount: number;
}

/**
 * Riga di stat-chip per una DayCard: km e tempo di guida del giorno (somma
 * delle tratte consecutive, tramite sonde invisibili che condividono la
 * cache di useDrivingTime — nessuna chiamata Directions aggiuntiva rispetto
 * a quelle già fatte altrove nell'app) e numero di tappe.
 */
export default function DayStatsRow({ pairs, stopsCount }: DayStatsRowProps) {
  const [values, setValues] = useState<Record<string, PairValue | null>>({});

  const onValue = useCallback((key: string, value: PairValue | null) => {
    setValues((prev) => (prev[key] === value ? prev : { ...prev, [key]: value }));
  }, []);

  const resolved = pairs.filter((p) => values[p.key]);
  const totalSeconds = resolved.reduce((sum, p) => sum + (values[p.key]?.seconds ?? 0), 0);
  const totalMeters = resolved.reduce((sum, p) => sum + (values[p.key]?.distanceMeters ?? 0), 0);
  const drivingLoading = pairs.length > 0 && resolved.length < pairs.length;

  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-1">
      {pairs.map((p) => (
        <PairProbe key={p.key} pairKey={p.key} from={p.from} to={p.to} onValue={onValue} />
      ))}
      {pairs.length > 0 && (
        <>
          <StatChip>
            🚗 {totalMeters > 0 ? `${Math.round(totalMeters / 1000)} km` : drivingLoading ? "…" : "0 km"}
          </StatChip>
          <StatChip>
            ⏱️ {totalSeconds > 0 ? formatDuration(totalSeconds) : drivingLoading ? "…" : "0 min"}
          </StatChip>
        </>
      )}
      <StatChip>
        📍 {stopsCount} {stopsCount === 1 ? "tappa" : "tappe"}
      </StatChip>
    </div>
  );
}
