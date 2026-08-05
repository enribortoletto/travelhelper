import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { format } from "date-fns";
import { listCategories, listStops } from "../../lib/trips";
import type { Category, EventRow } from "../../lib/types";
import { Card } from "../../components/ui/Card";
import { ChevronLeft } from "lucide-react";

// Placeholder overview — the full live-status / calendar / editor screens
// (A4) are Step 3/4's job. This just confirms a trip built through the
// wizard is real, persisted data.
export default function TripDetailPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const [stops, setStops] = useState<EventRow[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    if (!tripId) return;
    listStops(tripId).then(setStops);
    listCategories(tripId).then(setCategories);
  }, [tripId]);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-4 py-8">
      <Link to="/" className="flex items-center gap-1 text-sm text-text-secondary">
        <ChevronLeft className="size-4" /> Your Trips
      </Link>

      <h1 className="text-2xl font-semibold tracking-tight">Stops</h1>

      {stops === null && <p className="text-sm text-text-secondary">Loading…</p>}
      {stops?.length === 0 && (
        <Card>
          <p className="text-sm text-text-secondary">No stops yet.</p>
        </Card>
      )}

      <div className="flex flex-col gap-3">
        {stops?.map((stop) => {
          const category = categories.find((c) => c.id === stop.category_id);
          return (
            <Card key={stop.id} size="sm" className="flex flex-col gap-1">
              <p className="text-sm font-semibold text-text-primary">{stop.name}</p>
              <p className="text-xs text-text-secondary capitalize">
                {category?.name}
                {stop.day ? ` • ${format(new Date(stop.day), "d MMM")}` : ""}
                {stop.start_time ? ` • ${stop.start_time}` : ""}
                {stop.start_time_label ? ` • ${stop.start_time_label}` : ""}
              </p>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
