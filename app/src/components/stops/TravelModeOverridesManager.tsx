import { useState } from "react";
import { Card } from "../ui/Card";
import { PlaceAutocompleteInput } from "./PlaceAutocompleteInput";
import { createTravelModeOverride, deleteTravelModeOverride } from "../../lib/travel-mode-overrides";
import type { TravelMode, TravelModeOverride } from "../../lib/types";

const MODES: TravelMode[] = ["driving", "walking", "transit"];

/**
 * §6 per-trip travel-mode overrides — a small, explicit list of place-pair
 * exceptions to the driving default (e.g. a walkable hop, a transit-only leg).
 */
export function TravelModeOverridesManager({
  tripId,
  overrides,
  onChange,
}: {
  tripId: string;
  overrides: TravelModeOverride[];
  onChange: (overrides: TravelModeOverride[]) => void;
}) {
  const [nameA, setNameA] = useState("");
  const [nameB, setNameB] = useState("");
  const [placeIdA, setPlaceIdA] = useState<string | null>(null);
  const [placeIdB, setPlaceIdB] = useState<string | null>(null);
  const [mode, setMode] = useState<TravelMode>("walking");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    if (!placeIdA || !placeIdB) {
      setError("Pick both places from the suggestions so they resolve to real locations.");
      return;
    }
    setError(null);
    try {
      const override = await createTravelModeOverride(tripId, { placeIdA, placeIdB, mode, note });
      onChange([...overrides, override]);
      setNameA("");
      setNameB("");
      setPlaceIdA(null);
      setPlaceIdB(null);
      setNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create override.");
    }
  }

  async function handleDelete(id: string) {
    await deleteTravelModeOverride(id);
    onChange(overrides.filter((o) => o.id !== id));
  }

  return (
    <Card size="sm" className="flex flex-col gap-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
        Travel mode overrides
      </p>
      <p className="text-xs text-text-secondary">
        Driving is the default between any two stops — add an exception here for a specific pair (e.g. lodging
        that's walkable to a station).
      </p>

      {overrides.length > 0 && (
        <div className="flex flex-col gap-2">
          {overrides.map((o) => (
            <div key={o.id} className="flex items-center justify-between rounded-input bg-surface-1 px-3 py-2 text-xs">
              <span className="capitalize text-text-primary">
                {o.mode}
                {o.note ? ` — ${o.note}` : ""}
              </span>
              <button onClick={() => handleDelete(o.id)} className="text-accent">
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <PlaceAutocompleteInput value={nameA} onChange={setNameA} onPlaceSelected={(p) => setPlaceIdA(p.placeId)} />
        <PlaceAutocompleteInput value={nameB} onChange={setNameB} onPlaceSelected={(p) => setPlaceIdB(p.placeId)} />
        <div className="flex gap-2">
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`flex-1 rounded-chip px-3 py-2 text-[10px] font-semibold capitalize ${
                mode === m ? "bg-brand text-bg" : "bg-surface-2 text-text-primary"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional)"
          className="h-10 rounded-input border border-border-strong bg-bg px-3 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none"
        />
        <button
          type="button"
          onClick={handleCreate}
          className="h-10 rounded-input bg-brand text-xs font-semibold text-bg"
        >
          Add override
        </button>
        {error && <p className="text-xs text-accent">{error}</p>}
      </div>
    </Card>
  );
}
