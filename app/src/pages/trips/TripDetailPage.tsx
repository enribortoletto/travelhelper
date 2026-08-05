import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { supabase } from "../../lib/supabase";
import {
  createStop,
  deleteStop,
  listCategories,
  listStops,
  setStopSkipped,
  startStopNow,
  syncStopStatuses,
  updateStop,
} from "../../lib/trips";
import type { Category, EventRow, Trip } from "../../lib/types";
import { Card } from "../../components/ui/Card";
import { StopForm, type StopFormValues } from "../../components/stops/StopForm";
import { StopCard } from "../../components/stops/StopCard";
import { CategoryManager } from "../../components/stops/CategoryManager";

export default function TripDetailPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [stops, setStops] = useState<EventRow[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [editingStop, setEditingStop] = useState<EventRow | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refreshStops(currentTrip: Trip) {
    const freshStops = await listStops(currentTrip.id);
    await syncStopStatuses(freshStops, currentTrip.timezone);
    // Re-fetch so the UI reflects any statuses syncStopStatuses just persisted.
    setStops(await listStops(currentTrip.id));
  }

  useEffect(() => {
    if (!tripId) return;
    (async () => {
      const { data: tripData, error: tripError } = await supabase
        .from("trips")
        .select("*")
        .eq("id", tripId)
        .single();
      if (tripError) {
        setError(tripError.message);
        return;
      }
      setTrip(tripData);
      setCategories(await listCategories(tripId));
      await refreshStops(tripData);
    })();
  }, [tripId]);

  async function handleSubmitStop(values: StopFormValues) {
    if (!trip) return;
    setError(null);
    try {
      const payload = {
        trip_id: trip.id,
        category_id: values.categoryId,
        name: values.name,
        day: values.day,
        start_time: values.timeDefined && values.time ? `${values.time}:00` : null,
        start_time_label: !values.timeDefined && values.timeLabel ? values.timeLabel : null,
        planning_status: values.planningStatus,
        price: values.price || null,
        description: values.description || null,
      };
      if (editingStop && editingStop !== "new") {
        await updateStop(editingStop.id, payload);
      } else {
        await createStop(payload);
      }
      setEditingStop(null);
      await refreshStops(trip);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save stop.");
    }
  }

  async function handleDelete(stop: EventRow) {
    if (!trip) return;
    try {
      await deleteStop(stop.id);
      await refreshStops(trip);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete stop.");
    }
  }

  async function handleToggleSkip(stop: EventRow) {
    if (!trip) return;
    try {
      await setStopSkipped(stop.id, !stop.is_skipped);
      await refreshStops(trip);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update stop.");
    }
  }

  async function handleStartNow(stop: EventRow) {
    if (!trip) return;
    try {
      await startStopNow(stop, trip.timezone, stop.visit_duration_minutes);
      await refreshStops(trip);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start stop.");
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-4 py-8">
      <Link to="/" className="flex items-center gap-1 text-sm text-text-secondary">
        <ChevronLeft className="size-4" /> Your Trips
      </Link>

      <h1 className="text-2xl font-semibold tracking-tight">{trip?.name ?? "Trip"}</h1>

      {error && <p className="text-sm text-accent">{error}</p>}

      {trip && (
        <CategoryManager tripId={trip.id} categories={categories} onChange={setCategories} />
      )}

      <h2 className="text-lg font-semibold text-text-primary">Stops</h2>

      {stops === null && <p className="text-sm text-text-secondary">Loading…</p>}
      {stops?.length === 0 && editingStop !== "new" && (
        <Card>
          <p className="text-sm text-text-secondary">No stops yet.</p>
        </Card>
      )}

      <div className="flex flex-col gap-3">
        {stops?.map((stop) =>
          trip && editingStop !== "new" && editingStop && (editingStop as EventRow).id === stop.id ? (
            <StopForm
              key={stop.id}
              categories={categories}
              initialStop={stop}
              submitLabel="Save Changes"
              onSubmit={handleSubmitStop}
              onCancel={() => setEditingStop(null)}
            />
          ) : (
            trip && (
              <StopCard
                key={stop.id}
                stop={stop}
                trip={trip}
                category={categories.find((c) => c.id === stop.category_id)}
                onEdit={() => setEditingStop(stop)}
                onDelete={() => handleDelete(stop)}
                onToggleSkip={() => handleToggleSkip(stop)}
                onStartNow={() => handleStartNow(stop)}
              />
            )
          ),
        )}
      </div>

      {trip &&
        (editingStop === "new" ? (
          <StopForm
            categories={categories}
            submitLabel="Add Stop"
            onSubmit={handleSubmitStop}
            onCancel={() => setEditingStop(null)}
          />
        ) : (
          <button
            onClick={() => setEditingStop("new")}
            className="rounded-card border border-dashed border-border-strong p-3 text-center text-sm font-semibold text-brand"
          >
            + Add a stop
          </button>
        ))}
    </div>
  );
}
