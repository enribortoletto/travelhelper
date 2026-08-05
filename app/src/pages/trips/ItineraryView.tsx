import { useMemo, useState } from "react";
import { format } from "date-fns";
import { isPast } from "../../lib/status";
import { StopCard } from "../../components/stops/StopCard";
import { StopForm, type StopFormValues } from "../../components/stops/StopForm";
import { Card } from "../../components/ui/Card";
import { TextField } from "../../components/ui/TextField";
import type { Category, EventRow, Trip } from "../../lib/types";

export function ItineraryView({
  trip,
  stops,
  categories,
  editingStop,
  onStartCreate,
  onStartEdit,
  onCancelEdit,
  onSubmitStop,
  submitting,
  onDelete,
  onToggleSkip,
  onStartNow,
  onDelay,
}: {
  trip: Trip;
  stops: EventRow[];
  categories: Category[];
  editingStop: EventRow | "new" | null;
  onStartCreate: () => void;
  onStartEdit: (stop: EventRow) => void;
  onCancelEdit: () => void;
  onSubmitStop: (values: StopFormValues) => void;
  submitting: boolean;
  onDelete: (stop: EventRow) => void;
  onToggleSkip: (stop: EventRow) => void;
  onStartNow: (stop: EventRow) => void;
  onDelay: (stop: EventRow) => void;
}) {
  const [query, setQuery] = useState("");

  const planned = stops.filter((s) => !s.is_derived && s.planning_status === "planned");

  const progressTotal = planned.filter((s) => !s.is_skipped).length;
  const progressDone = planned.filter(
    (s) =>
      !s.is_skipped &&
      isPast({ day: s.day, startTime: s.start_time, endTime: s.end_time, timezone: trip.timezone }),
  ).length;

  const filtered = useMemo(() => {
    if (!query.trim()) return stops.filter((s) => !s.is_derived);
    const q = query.trim().toLowerCase();
    return stops.filter((s) => {
      if (s.is_derived) return false;
      const category = categories.find((c) => c.id === s.category_id);
      return s.name.toLowerCase().includes(q) || category?.name.toLowerCase().includes(q);
    });
  }, [stops, categories, query]);

  const byDay = useMemo(() => {
    const groups = new Map<string, EventRow[]>();
    for (const stop of filtered) {
      const key = stop.day ?? "Unscheduled";
      groups.set(key, [...(groups.get(key) ?? []), stop]);
    }
    return [...groups.entries()].sort(([a], [b]) => {
      if (a === "Unscheduled") return 1;
      if (b === "Unscheduled") return -1;
      return a.localeCompare(b);
    });
  }, [filtered]);

  function categoryFor(stop: EventRow) {
    return categories.find((c) => c.id === stop.category_id);
  }

  const cardProps = (stop: EventRow) => ({
    stop,
    trip,
    category: categoryFor(stop),
    onEdit: () => onStartEdit(stop),
    onDelete: () => onDelete(stop),
    onToggleSkip: () => onToggleSkip(stop),
    onStartNow: () => onStartNow(stop),
    onDelay: () => onDelay(stop),
  });

  return (
    <div className="flex flex-col gap-4">
      {progressTotal > 0 && (
        <Card size="sm" className="flex items-center justify-between">
          <p className="text-xs font-semibold text-text-secondary">Trip progress</p>
          <p className="text-sm font-semibold text-text-primary">
            {progressDone} / {progressTotal} stops done
          </p>
        </Card>
      )}

      <TextField
        label="Search stops"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name or category…"
      />

      {byDay.length === 0 && (
        <Card>
          <p className="text-sm text-text-secondary">No stops match your search.</p>
        </Card>
      )}

      {byDay.map(([day, dayStops]) => (
        <div key={day} className="flex flex-col gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
            {day === "Unscheduled" ? "Unscheduled" : format(new Date(day), "EEEE d MMM")}
          </p>
          {dayStops.map((stop) =>
            editingStop !== "new" && editingStop && editingStop.id === stop.id ? (
              <StopForm
                key={stop.id}
                categories={categories}
                initialStop={stop}
                submitLabel="Save Changes"
                submitting={submitting}
                onSubmit={onSubmitStop}
                onCancel={onCancelEdit}
              />
            ) : (
              <div key={stop.id} className="relative">
                {categoryFor(stop)?.name === "accommodation" && (
                  <span className="absolute -top-2 left-3 rounded-full bg-brand px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-bg">
                    Staying here
                  </span>
                )}
                <StopCard {...cardProps(stop)} />
              </div>
            ),
          )}
        </div>
      ))}

      {editingStop === "new" ? (
        <StopForm
          categories={categories}
          submitLabel="Add Stop"
          submitting={submitting}
          onSubmit={onSubmitStop}
          onCancel={onCancelEdit}
        />
      ) : (
        <button
          onClick={onStartCreate}
          className="rounded-card border border-dashed border-border-strong p-3 text-center text-sm font-semibold text-brand"
        >
          + Add a stop
        </button>
      )}
    </div>
  );
}
