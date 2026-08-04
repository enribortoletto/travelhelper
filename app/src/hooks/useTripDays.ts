import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { TripDayRow } from "@/types/database";

export function useTripDays(tripId: string | null) {
  const [tripDays, setTripDays] = useState<TripDayRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tripId) {
      setTripDays([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    supabase
      .from("trip_days")
      .select("*")
      .eq("trip_id", tripId)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error && data) setTripDays(data as TripDayRow[]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tripId]);

  return { tripDays, loading };
}
