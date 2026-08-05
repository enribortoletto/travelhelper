import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { supabase } from "../../lib/supabase";
import {
  createStop,
  delayStop,
  deleteStop,
  listCategories,
  listStops,
  setStopSkipped,
  startStopNow,
  syncStopStatuses,
  updateStop,
} from "../../lib/trips";
import type { Category, EventRow, Trip } from "../../lib/types";
import { CategoryManager } from "../../components/stops/CategoryManager";
import type { StopFormValues } from "../../components/stops/StopForm";
import { TodayView } from "./TodayView";
import { ItineraryView } from "./ItineraryView";

type Tab = "today" | "itinerary" | "categories";

export default function TripDetailPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [stops, setStops] = useState<EventRow[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [editingStop, setEditingStop] = useState<EventRow | "new" | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("today");

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
    setSubmitting(true);
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
        maps_link: values.mapsLink || null,
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
    } finally {
      setSubmitting(false);
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

  async function handleDelay(stop: EventRow) {
    if (!trip) return;
    try {
      await delayStop(stop, 15);
      await refreshStops(trip);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not mark stop as delayed.");
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-4 py-8">
      <Link to="/" className="flex items-center gap-1 text-sm text-text-secondary">
        <ChevronLeft className="size-4" /> Your Trips
      </Link>

      <h1 className="text-2xl font-semibold tracking-tight">{trip?.name ?? "Trip"}</h1>

      {error && <p className="text-sm text-accent">{error}</p>}

      <div className="flex gap-1.5 rounded-chip bg-surface-1 p-1">
        {(["today", "itinerary", "categories"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-chip py-2 text-xs font-semibold capitalize ${
              tab === t ? "bg-brand text-bg" : "text-text-secondary"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {stops === null && <p className="text-sm text-text-secondary">Loading…</p>}

      {trip && stops && tab === "today" && (
        <TodayView
          trip={trip}
          stops={stops}
          categories={categories}
          onEdit={(stop) => {
            setEditingStop(stop);
            setTab("itinerary");
          }}
          onDelete={handleDelete}
          onToggleSkip={handleToggleSkip}
          onStartNow={handleStartNow}
          onDelay={handleDelay}
        />
      )}

      {trip && stops && tab === "itinerary" && (
        <ItineraryView
          trip={trip}
          stops={stops}
          categories={categories}
          editingStop={editingStop}
          submitting={submitting}
          onStartCreate={() => setEditingStop("new")}
          onStartEdit={setEditingStop}
          onCancelEdit={() => setEditingStop(null)}
          onSubmitStop={handleSubmitStop}
          onDelete={handleDelete}
          onToggleSkip={handleToggleSkip}
          onStartNow={handleStartNow}
          onDelay={handleDelay}
        />
      )}

      {trip && tab === "categories" && (
        <CategoryManager tripId={trip.id} categories={categories} onChange={setCategories} />
      )}
    </div>
  );
}
