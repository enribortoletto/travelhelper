import { useState, type FormEvent } from "react";
import { addDays, differenceInCalendarDays, format } from "date-fns";
import { WizardHeader } from "../../../components/ui/WizardHeader";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { TextField } from "../../../components/ui/TextField";
import { createStop } from "../../../lib/trips";
import type { Category, EventRow, Trip } from "../../../lib/types";
import { Info } from "lucide-react";

export function AddStopsStep({
  trip,
  categories,
  onNext,
}: {
  trip: Trip;
  categories: Category[];
  onNext: () => void;
}) {
  const tripLengthDays = differenceInCalendarDays(new Date(trip.end_date), new Date(trip.start_date)) + 1;
  const [addedStops, setAddedStops] = useState<EventRow[]>([]);
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [day, setDay] = useState(1);
  const [timeDefined, setTimeDefined] = useState(true);
  const [time, setTime] = useState("");
  const [timeLabel, setTimeLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedCategory = categories.find((c) => c.id === categoryId);
  const forcedPlanned = selectedCategory?.name === "accommodation";

  async function handleAdd(event: FormEvent) {
    event.preventDefault();
    if (!name || !categoryId) return;
    setSubmitting(true);
    setError(null);
    try {
      const stopDay = format(addDays(new Date(trip.start_date), day - 1), "yyyy-MM-dd");
      const stop = await createStop({
        trip_id: trip.id,
        category_id: categoryId,
        name,
        day: stopDay,
        start_time: timeDefined && time ? time : null,
        start_time_label: !timeDefined && timeLabel ? timeLabel : null,
        planning_status: "planned",
      });
      setAddedStops((prev) => [...prev, stop]);
      setName("");
      setTime("");
      setTimeLabel("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add stop.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex w-full flex-col gap-3">
      <WizardHeader
        step={2}
        totalSteps={3}
        title="Add Your First Stops"
        subtitle="Accommodation & primary landmarks"
      />

      {addedStops.map((stop) => {
        const cat = categories.find((c) => c.id === stop.category_id);
        return (
          <Card key={stop.id} size="sm" className="flex items-center gap-3">
            <div className="flex-1">
              <p className="text-sm font-semibold text-text-primary">{stop.name}</p>
              <p className="text-xs text-text-secondary">
                {cat?.name} • Day{" "}
                {differenceInCalendarDays(new Date(stop.day!), new Date(trip.start_date)) + 1}
                {stop.start_time ? ` • ${stop.start_time}` : ""}
                {stop.start_time_label ? ` • ${stop.start_time_label}` : ""}
              </p>
            </div>
            <span className="rounded-xl bg-brand-tint px-2.5 py-1 text-[10px] font-semibold text-bg">
              Added
            </span>
          </Card>
        );
      })}

      <Card className="flex flex-col gap-3.5">
        <p className="text-base font-semibold text-text-primary">New Stop Details</p>

        <TextField
          label="Stop name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Glencoe Visitor Centre"
        />

        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
            Category
          </label>
          <div className="flex flex-wrap gap-1.5">
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategoryId(cat.id)}
                className={`rounded-chip px-3 py-2 text-[10px] font-semibold capitalize ${
                  cat.id === categoryId ? "bg-brand text-bg" : "bg-surface-2 text-text-primary"
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          <div className="flex flex-1 flex-col gap-1.5 rounded-input border border-surface-2 bg-bg p-3">
            <label className="text-[10px] font-semibold text-text-secondary">Day</label>
            <input
              type="number"
              min={1}
              max={tripLengthDays}
              value={day}
              onChange={(e) => setDay(Number(e.target.value))}
              className="w-full bg-transparent text-sm font-medium text-text-primary focus:outline-none"
            />
          </div>
          <div className="flex flex-1 flex-col gap-1.5 rounded-input border border-surface-2 bg-bg p-3">
            <label className="flex items-center justify-between text-[10px] font-semibold text-text-secondary">
              Time
              <button
                type="button"
                onClick={() => setTimeDefined((v) => !v)}
                className="font-semibold text-brand"
              >
                {timeDefined ? "Use label" : "Use time"}
              </button>
            </label>
            {timeDefined ? (
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full bg-transparent text-sm font-medium text-text-primary focus:outline-none"
              />
            ) : (
              <input
                type="text"
                value={timeLabel}
                onChange={(e) => setTimeLabel(e.target.value)}
                placeholder="e.g. Evening check-in"
                className="w-full bg-transparent text-sm font-medium text-text-primary placeholder:text-text-tertiary focus:outline-none"
              />
            )}
          </div>
        </div>

        {forcedPlanned && (
          <p className="text-xs text-text-secondary">
            Accommodation stops are always planned, not optional.
          </p>
        )}

        {error && <p className="text-xs text-accent">{error}</p>}

        <Button type="button" variant="brand" onClick={handleAdd} disabled={submitting}>
          {submitting ? "Adding…" : "Add"}
        </Button>
      </Card>

      <div className="flex items-center gap-2 rounded-card bg-surface-1 p-3.5">
        <Info className="size-4 shrink-0 text-text-secondary" />
        <p className="text-xs text-text-secondary">
          Add at least your accommodation and key activities to shape Day 1.
        </p>
      </div>

      <Button withArrow onClick={onNext}>
        Continue to Invites
      </Button>
    </div>
  );
}
