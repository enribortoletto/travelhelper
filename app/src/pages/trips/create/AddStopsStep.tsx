import { useState } from "react";
import { differenceInCalendarDays } from "date-fns";
import { WizardHeader } from "../../../components/ui/WizardHeader";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { StopForm, type StopFormValues } from "../../../components/stops/StopForm";
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
  const [addedStops, setAddedStops] = useState<EventRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);

  async function handleAdd(values: StopFormValues) {
    setSubmitting(true);
    setError(null);
    try {
      const stop = await createStop({
        trip_id: trip.id,
        category_id: values.categoryId,
        name: values.name,
        day: values.day ?? trip.start_date,
        start_time: values.timeDefined && values.time ? `${values.time}:00` : null,
        start_time_label: !values.timeDefined && values.timeLabel ? values.timeLabel : null,
        planning_status: values.planningStatus,
        price: values.price || null,
        description: values.description || null,
      });
      setAddedStops((prev) => [...prev, stop]);
      setFormKey((k) => k + 1);
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

      <StopForm key={formKey} categories={categories} submitLabel="Add" submitting={submitting} onSubmit={handleAdd} />

      {error && <p className="text-xs text-accent">{error}</p>}

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
