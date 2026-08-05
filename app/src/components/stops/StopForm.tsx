import { useState, type FormEvent } from "react";
import { Card } from "../ui/Card";
import { TextField } from "../ui/TextField";
import { Button } from "../ui/Button";
import type { Category, EventRow, PlanningStatus } from "../../lib/types";

export interface StopFormValues {
  name: string;
  categoryId: string;
  day: string | null;
  timeDefined: boolean;
  time: string;
  timeLabel: string;
  planningStatus: PlanningStatus;
  price: string;
  description: string;
}

function valuesFromStop(stop: EventRow): StopFormValues {
  return {
    name: stop.name,
    categoryId: stop.category_id,
    day: stop.day,
    timeDefined: !!stop.start_time || !stop.start_time_label,
    time: stop.start_time?.slice(0, 5) ?? "",
    timeLabel: stop.start_time_label ?? "",
    planningStatus: stop.planning_status ?? "planned",
    price: stop.price ?? "",
    description: stop.description ?? "",
  };
}

export function StopForm({
  categories,
  initialStop,
  submitLabel = "Save",
  submitting = false,
  onSubmit,
  onCancel,
}: {
  categories: Category[];
  initialStop?: EventRow;
  submitLabel?: string;
  submitting?: boolean;
  onSubmit: (values: StopFormValues) => void;
  onCancel?: () => void;
}) {
  const [values, setValues] = useState<StopFormValues>(
    initialStop
      ? valuesFromStop(initialStop)
      : {
          name: "",
          categoryId: categories[0]?.id ?? "",
          day: null,
          timeDefined: true,
          time: "",
          timeLabel: "",
          planningStatus: "planned",
          price: "",
          description: "",
        },
  );

  const selectedCategory = categories.find((c) => c.id === values.categoryId);
  const forcedPlanned = selectedCategory?.name === "accommodation";

  function set<K extends keyof StopFormValues>(key: K, value: StopFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!values.name || !values.categoryId) return;
    onSubmit(forcedPlanned ? { ...values, planningStatus: "planned" } : values);
  }

  return (
    <Card className="flex flex-col gap-3.5">
      <p className="text-base font-semibold text-text-primary">
        {initialStop ? "Edit Stop" : "New Stop Details"}
      </p>

      <TextField
        label="Stop name"
        required
        value={values.name}
        onChange={(e) => set("name", e.target.value)}
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
              onClick={() => set("categoryId", cat.id)}
              className={`rounded-chip px-3 py-2 text-[10px] font-semibold capitalize ${
                cat.id === values.categoryId ? "bg-brand text-bg" : "bg-surface-2 text-text-primary"
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
            type="date"
            value={values.day ?? ""}
            onChange={(e) => set("day", e.target.value || null)}
            className="w-full bg-transparent text-sm font-medium text-text-primary focus:outline-none"
          />
        </div>
        <div className="flex flex-1 flex-col gap-1.5 rounded-input border border-surface-2 bg-bg p-3">
          <label className="flex items-center justify-between text-[10px] font-semibold text-text-secondary">
            Time
            <button
              type="button"
              onClick={() => set("timeDefined", !values.timeDefined)}
              className="font-semibold text-brand"
            >
              {values.timeDefined ? "Use label" : "Use time"}
            </button>
          </label>
          {values.timeDefined ? (
            <input
              type="time"
              value={values.time}
              onChange={(e) => set("time", e.target.value)}
              className="w-full bg-transparent text-sm font-medium text-text-primary focus:outline-none"
            />
          ) : (
            <input
              type="text"
              value={values.timeLabel}
              onChange={(e) => set("timeLabel", e.target.value)}
              placeholder="e.g. Evening check-in"
              className="w-full bg-transparent text-sm font-medium text-text-primary placeholder:text-text-tertiary focus:outline-none"
            />
          )}
        </div>
      </div>

      <div className="flex gap-3">
        <TextField
          label="Price"
          value={values.price}
          onChange={(e) => set("price", e.target.value)}
          placeholder="e.g. £12"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] font-medium uppercase tracking-wide text-text-tertiary">
          Description
        </label>
        <textarea
          value={values.description}
          onChange={(e) => set("description", e.target.value)}
          rows={2}
          className="w-full rounded-input border border-border-strong bg-bg px-4 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-brand"
          placeholder="Optional notes…"
        />
      </div>

      {forcedPlanned ? (
        <p className="text-xs text-text-secondary">
          Accommodation stops are always planned, not optional.
        </p>
      ) : (
        <label className="flex items-center gap-2 text-xs text-text-secondary">
          <input
            type="checkbox"
            checked={values.planningStatus === "optional"}
            onChange={(e) => set("planningStatus", e.target.checked ? "optional" : "planned")}
          />
          Mark as optional (an idea, not committed yet)
        </label>
      )}

      <div className="flex gap-2">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} className="bg-surface-2">
            Cancel
          </Button>
        )}
        <Button type="button" variant="brand" onClick={handleSubmit} disabled={submitting}>
          {submitting ? "Saving…" : submitLabel}
        </Button>
      </div>
    </Card>
  );
}
