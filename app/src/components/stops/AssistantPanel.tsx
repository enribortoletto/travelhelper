import { useEffect, useState } from "react";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import { PlaceAutocompleteInput } from "./PlaceAutocompleteInput";
import {
  confirmPreview,
  discardPreview,
  listChangeHistory,
  listPendingPreviews,
  requestAddStopPreview,
  requestEditTimePreview,
  requestRemoveStopPreview,
} from "../../lib/ai-assistant";
import { recalculateDay } from "../../lib/itinerary-engine";
import type { AiPreview, EventRow, ItineraryChangeLogRow, Trip } from "../../lib/types";

const CHANGE_TYPE_LABEL: Record<string, string> = {
  ai_create: "Added",
  ai_update: "Updated",
  ai_delete: "Removed",
};

function PreviewCard({ preview, onConfirm, onDiscard, busy }: { preview: AiPreview; onConfirm: () => void; onDiscard: () => void; busy: boolean }) {
  const { summary, conflicts, resolutionSuggestions } = preview.proposed_changes;
  return (
    <Card size="sm" className="flex flex-col gap-2 border border-brand">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-brand">Proposed change</p>
      <p className="text-sm font-semibold text-text-primary">{summary}</p>

      {conflicts?.length > 0 && (
        <div className="flex flex-col gap-1">
          {conflicts.map((c, i) => (
            <p key={i} className="text-xs text-accent">
              ⚠️ {c.message}
            </p>
          ))}
        </div>
      )}

      {resolutionSuggestions && resolutionSuggestions.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-text-secondary">Possible fixes</p>
          {resolutionSuggestions.map((r, i) => (
            <p key={i} className="text-xs text-text-secondary">
              {r.type === "swap_optional" ? `Swap in "${r.name}" (currently optional)` : `Consider dropping "${r.name}" (low priority)`}
            </p>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Button type="button" variant="ghost" className="bg-surface-2" onClick={onDiscard} disabled={busy}>
          Discard
        </Button>
        <Button type="button" variant="brand" onClick={onConfirm} disabled={busy}>
          {busy ? "Applying…" : "Confirm"}
        </Button>
      </div>
    </Card>
  );
}

export function AssistantPanel({ trip, stops }: { trip: Trip; stops: EventRow[] }) {
  const [pending, setPending] = useState<AiPreview[]>([]);
  const [history, setHistory] = useState<ItineraryChangeLogRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [query, setQuery] = useState("");
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [addDay, setAddDay] = useState("");
  const [addOptional, setAddOptional] = useState(false);

  const [retimeTarget, setRetimeTarget] = useState<EventRow | null>(null);
  const [retimeValue, setRetimeValue] = useState("");

  async function refresh() {
    setPending(await listPendingPreviews(trip.id));
    setHistory(await listChangeHistory(trip.id));
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip.id]);

  async function handleConfirm(preview: AiPreview) {
    setBusy(true);
    setError(null);
    try {
      await confirmPreview(preview.id);
      if (preview.day) await recalculateDay(trip.id, preview.day);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not apply that change.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDiscard(preview: AiPreview) {
    setBusy(true);
    try {
      await discardPreview(preview.id);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleProposeAdd() {
    setError(null);
    setBusy(true);
    try {
      await requestAddStopPreview({
        tripId: trip.id,
        query: placeId ? undefined : query,
        placeId: placeId ?? undefined,
        day: addDay || null,
        planningStatus: addOptional ? "optional" : "planned",
      });
      setQuery("");
      setPlaceId(null);
      setAddDay("");
      setAddOptional(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not propose that stop.");
    } finally {
      setBusy(false);
    }
  }

  async function handleProposeRemove(stop: EventRow) {
    setError(null);
    setBusy(true);
    try {
      await requestRemoveStopPreview({ tripId: trip.id, eventId: stop.id, mode: "delete" });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not propose removing that stop.");
    } finally {
      setBusy(false);
    }
  }

  async function handleProposeRetime() {
    if (!retimeTarget || !retimeValue) return;
    setError(null);
    setBusy(true);
    try {
      await requestEditTimePreview({ tripId: trip.id, eventId: retimeTarget.id, newStartTime: retimeValue });
      setRetimeTarget(null);
      setRetimeValue("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not propose that time change.");
    } finally {
      setBusy(false);
    }
  }

  const editableStops = stops.filter((s) => !s.is_derived);

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-xs text-accent">{error}</p>}

      {pending.map((preview) => (
        <PreviewCard
          key={preview.id}
          preview={preview}
          busy={busy}
          onConfirm={() => handleConfirm(preview)}
          onDiscard={() => handleDiscard(preview)}
        />
      ))}

      <Card size="sm" className="flex flex-col gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-text-secondary">Add a stop (Flow 1)</p>
        <PlaceAutocompleteInput
          value={query}
          onChange={setQuery}
          onPlaceSelected={(place) => {
            setQuery(place.name);
            setPlaceId(place.placeId);
          }}
        />
        <input
          type="date"
          value={addDay}
          onChange={(e) => setAddDay(e.target.value)}
          className="h-10 rounded-input border border-border-strong bg-bg px-3 text-xs text-text-primary"
        />
        <label className="flex items-center gap-2 text-xs text-text-secondary">
          <input type="checkbox" checked={addOptional} onChange={(e) => setAddOptional(e.target.checked)} />
          Mark as optional
        </label>
        <Button type="button" variant="brand" onClick={handleProposeAdd} disabled={busy || !query}>
          Propose
        </Button>
      </Card>

      <div className="flex flex-col gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-text-secondary">Adjust an existing stop</p>
        {editableStops.map((stop) => (
          <Card key={stop.id} size="sm" className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-text-primary">{stop.name}</p>
            {retimeTarget?.id === stop.id ? (
              <div className="flex gap-2">
                <input
                  type="time"
                  value={retimeValue}
                  onChange={(e) => setRetimeValue(e.target.value)}
                  className="h-10 flex-1 rounded-input border border-border-strong bg-bg px-3 text-xs text-text-primary"
                />
                <button onClick={handleProposeRetime} className="rounded-input bg-brand px-3 text-xs font-semibold text-bg">
                  Propose
                </button>
                <button onClick={() => setRetimeTarget(null)} className="rounded-input bg-surface-2 px-3 text-xs font-semibold text-text-primary">
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex gap-3 text-xs font-semibold">
                <button
                  onClick={() => {
                    setRetimeTarget(stop);
                    setRetimeValue(stop.start_time?.slice(0, 5) ?? "");
                  }}
                  className="text-brand"
                >
                  Retime
                </button>
                <button onClick={() => handleProposeRemove(stop)} className="text-accent">
                  Remove
                </button>
              </div>
            )}
          </Card>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-text-secondary">Recent AI changes</p>
        {history.length === 0 && <p className="text-xs text-text-secondary">No changes yet.</p>}
        {history.map((h) => (
          <Card key={h.id} size="sm" className="flex flex-col gap-1">
            <p className="text-xs font-semibold text-text-primary">{CHANGE_TYPE_LABEL[h.change_type] ?? h.change_type}</p>
            <p className="text-[10px] text-text-tertiary">{new Date(h.created_at).toLocaleString()}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
