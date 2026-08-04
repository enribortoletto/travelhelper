import { useCallback, useEffect, useMemo, useState } from "react";
import { useDrivingDetails } from "@/hooks/useDrivingTime";
import { splitPairsByProgress, type ConsecutivePlacePair } from "@/lib/trip-stats";
import type { TripRow } from "@/types/database";

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

interface TravelHoursStatProps {
  pairs: ConsecutivePlacePair[];
  trip: TripRow;
  /** Riporta al genitore la frazione (0-1) di guida già percorsa, per la barra di avanzamento della card. */
  onFractionChange: (fraction: number) => void;
}

/**
 * Somma il tempo/distanza di guida reale (Directions API) sulle tratte
 * consecutive già "avvenute" rispetto al punto del viaggio in cui ci si
 * trova ora (vedi splitPairsByProgress) — non il totale dell'intero
 * viaggio. Ogni tratta è risolta da un componente-sonda invisibile che
 * condivide la cache di useDrivingTime — nessuna richiesta duplicata per le
 * tratte già note (es. già viste in Oggi/Dettaglio Giorno).
 */
export default function TravelHoursStat({ pairs, trip, onFractionChange }: TravelHoursStatProps) {
  const [values, setValues] = useState<Record<string, PairValue | null>>({});

  const onValue = useCallback((key: string, value: PairValue | null) => {
    setValues((prev) => (prev[key] === value ? prev : { ...prev, [key]: value }));
  }, []);

  const donePairs = useMemo(() => splitPairsByProgress(pairs, trip).done, [pairs, trip]);

  const resolvedDone = donePairs.filter((p) => values[p.key]);
  const doneSeconds = resolvedDone.reduce((sum, p) => sum + (values[p.key]?.seconds ?? 0), 0);
  const doneMeters = resolvedDone.reduce((sum, p) => sum + (values[p.key]?.distanceMeters ?? 0), 0);

  const resolvedAll = pairs.filter((p) => values[p.key]);
  const totalSeconds = resolvedAll.reduce((sum, p) => sum + (values[p.key]?.seconds ?? 0), 0);
  const loading = pairs.length > 0 && resolvedAll.length < pairs.length;

  const fraction = totalSeconds > 0 ? doneSeconds / totalSeconds : 0;

  useEffect(() => {
    onFractionChange(fraction);
  }, [fraction, onFractionChange]);

  const doneHours = doneSeconds / 3600;
  const doneKm = Math.round(doneMeters / 1000);
  const stillResolving = donePairs.length > 0 && loading;

  return (
    <>
      {pairs.map((p) => (
        <PairProbe key={p.key} pairKey={p.key} from={p.from} to={p.to} onValue={onValue} />
      ))}
      <div className="flex flex-col items-start gap-1">
        <div className="flex items-baseline gap-1.5">
          <span className="text-sm font-semibold text-[var(--text)]">
            {doneKm > 0 ? doneKm : stillResolving ? "…" : "0"}
          </span>
          <span className="text-sm font-medium text-[var(--text)]">km</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-sm font-semibold text-[var(--text)]">
            {doneHours > 0 ? doneHours.toFixed(1) : stillResolving ? "…" : "0"}
          </span>
          <span className="text-sm font-medium text-[var(--text)]">ore</span>
        </div>
      </div>
      <p className="text-sm font-medium text-[var(--text)]">Percorse finora</p>
    </>
  );
}
