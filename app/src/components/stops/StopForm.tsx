import { useState, type FormEvent } from "react";
import { Card } from "../ui/Card";
import { TextField } from "../ui/TextField";
import { Button } from "../ui/Button";
import { PlaceAutocompleteInput } from "./PlaceAutocompleteInput";
import { fetchOpeningHours } from "../../lib/opening-hours";
import type { Category, EventRow, FlightLeg, PlanningStatus, WeeklyOpeningHours } from "../../lib/types";

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
  mapsLink: string;
  placeId: string | null;
  visitDurationMinutes: string;
  openingHours: WeeklyOpeningHours | null;
  kitchenClosingTime: string;
  checkInWindowStart: string;
  checkInWindowEnd: string;
  checkoutDeadline: string;
  flightNumber: string;
  flightLeg: FlightLeg;
}

/** Shared mapper so both the wizard and the trip-detail form submit identical payload shapes. */
export function stopFormValuesToPayload(values: StopFormValues) {
  return {
    category_id: values.categoryId,
    name: values.name,
    day: values.day,
    start_time: values.timeDefined && values.time ? `${values.time}:00` : null,
    start_time_label: !values.timeDefined && values.timeLabel ? values.timeLabel : null,
    planning_status: values.planningStatus,
    price: values.price || null,
    description: values.description || null,
    maps_link: values.mapsLink || null,
    maps_place_id: values.placeId,
    visit_duration_minutes: values.visitDurationMinutes ? Number(values.visitDurationMinutes) : null,
    opening_hours: values.openingHours,
    kitchen_closing_time: values.kitchenClosingTime ? `${values.kitchenClosingTime}:00` : null,
    check_in_window_start: values.checkInWindowStart ? `${values.checkInWindowStart}:00` : null,
    check_in_window_end: values.checkInWindowEnd ? `${values.checkInWindowEnd}:00` : null,
    checkout_deadline: values.checkoutDeadline ? `${values.checkoutDeadline}:00` : null,
    flight_number: values.flightNumber || null,
    flight_leg: values.flightNumber ? values.flightLeg : null,
  };
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
    mapsLink: stop.maps_link ?? "",
    placeId: stop.maps_place_id,
    visitDurationMinutes: stop.visit_duration_minutes != null ? String(stop.visit_duration_minutes) : "",
    openingHours: stop.opening_hours,
    kitchenClosingTime: stop.kitchen_closing_time?.slice(0, 5) ?? "",
    checkInWindowStart: stop.check_in_window_start?.slice(0, 5) ?? "",
    checkInWindowEnd: stop.check_in_window_end?.slice(0, 5) ?? "",
    checkoutDeadline: stop.checkout_deadline?.slice(0, 5) ?? "",
    flightNumber: stop.flight_number ?? "",
    flightLeg: stop.flight_leg ?? "departure",
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
          mapsLink: "",
          placeId: null,
          visitDurationMinutes: "",
          openingHours: null,
          kitchenClosingTime: "",
          checkInWindowStart: "",
          checkInWindowEnd: "",
          checkoutDeadline: "",
          flightNumber: "",
          flightLeg: "departure",
        },
  );
  const [fetchingHours, setFetchingHours] = useState(false);

  const selectedCategory = categories.find((c) => c.id === values.categoryId);
  const forcedPlanned = selectedCategory?.name === "accommodation";
  const isAccommodation = selectedCategory?.name === "accommodation";
  const isTransport = selectedCategory?.name === "transport";
  const isFoodService = selectedCategory?.name === "meal";
  const hasOpeningHours = selectedCategory?.name !== "accommodation" && selectedCategory?.name !== "transport";

  function set<K extends keyof StopFormValues>(key: K, value: StopFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!values.name || !values.categoryId) return;

    let finalValues = forcedPlanned ? { ...values, planningStatus: "planned" as const } : values;

    // §8: fetch opening hours automatically once a place + day are both
    // known, but only when we don't already have them for this place —
    // never block stop creation if the lookup itself fails.
    if (hasOpeningHours && finalValues.placeId && finalValues.day && finalValues.placeId !== initialStop?.maps_place_id) {
      setFetchingHours(true);
      try {
        const openingHours = await fetchOpeningHours(finalValues.placeId);
        finalValues = { ...finalValues, openingHours };
      } catch {
        // Enrichment only — proceed without opening hours on failure.
      } finally {
        setFetchingHours(false);
      }
    }

    onSubmit(finalValues);
  }

  return (
    <Card className="flex flex-col gap-3.5">
      <p className="text-base font-semibold text-text-primary">
        {initialStop ? "Edit Stop" : "New Stop Details"}
      </p>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="stop-name" className="text-[10px] font-medium uppercase tracking-wide text-text-tertiary">
          Stop name
        </label>
        <PlaceAutocompleteInput
          value={values.name}
          onChange={(name) => set("name", name)}
          onPlaceSelected={(place) => {
            set("placeId", place.placeId);
            set("mapsLink", place.mapsLink);
          }}
        />
        {values.placeId && <p className="text-[10px] text-text-tertiary">Linked to a real place ✓</p>}
      </div>

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
          className="flex-1"
          value={values.price}
          onChange={(e) => set("price", e.target.value)}
          placeholder="e.g. £12"
        />
        <TextField
          label="Visit duration (min)"
          className="flex-1"
          type="number"
          min={0}
          value={values.visitDurationMinutes}
          onChange={(e) => set("visitDurationMinutes", e.target.value)}
          placeholder="e.g. 90"
        />
      </div>

      {!values.placeId && (
        <TextField
          label="Maps link"
          value={values.mapsLink}
          onChange={(e) => set("mapsLink", e.target.value)}
          placeholder="Paste a Google Maps link (or pick a place above)"
        />
      )}

      {isTransport && (
        <div className="flex flex-col gap-2 rounded-card bg-surface-1 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
            Flight tracking (optional)
          </p>
          <div className="flex gap-3">
            <TextField
              label="Flight number"
              className="flex-1"
              value={values.flightNumber}
              onChange={(e) => set("flightNumber", e.target.value.toUpperCase())}
              placeholder="e.g. BA1326"
            />
            <div className="flex flex-1 flex-col gap-1.5">
              <label className="text-[10px] font-medium uppercase tracking-wide text-text-tertiary">Leg</label>
              <div className="flex gap-1.5">
                {(["departure", "arrival"] as const).map((leg) => (
                  <button
                    key={leg}
                    type="button"
                    onClick={() => set("flightLeg", leg)}
                    className={`flex-1 rounded-chip py-2 text-[10px] font-semibold capitalize ${
                      values.flightLeg === leg ? "bg-brand text-bg" : "bg-surface-2 text-text-primary"
                    }`}
                  >
                    {leg}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {isFoodService && (
        <TextField
          label="Kitchen closing time (optional)"
          type="time"
          value={values.kitchenClosingTime}
          onChange={(e) => set("kitchenClosingTime", e.target.value)}
        />
      )}

      {isAccommodation && (
        <div className="flex flex-col gap-2 rounded-card bg-surface-1 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
            Check-in / check-out (optional)
          </p>
          <div className="flex gap-3">
            <TextField
              label="Check-in opens"
              className="flex-1"
              type="time"
              value={values.checkInWindowStart}
              onChange={(e) => set("checkInWindowStart", e.target.value)}
            />
            <TextField
              label="Check-in closes"
              className="flex-1"
              type="time"
              value={values.checkInWindowEnd}
              onChange={(e) => set("checkInWindowEnd", e.target.value)}
            />
          </div>
          <TextField
            label="Checkout deadline"
            type="time"
            value={values.checkoutDeadline}
            onChange={(e) => set("checkoutDeadline", e.target.value)}
          />
        </div>
      )}

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
        <Button type="button" variant="brand" onClick={handleSubmit} disabled={submitting || fetchingHours}>
          {fetchingHours ? "Checking hours…" : submitting ? "Saving…" : submitLabel}
        </Button>
      </div>
    </Card>
  );
}
