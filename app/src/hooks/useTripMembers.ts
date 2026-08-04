import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { TripMemberRow } from "@/types/database";

export function useTripMembers(tripId: string | null) {
  const [members, setMembers] = useState<TripMemberRow[]>([]);

  useEffect(() => {
    if (!tripId) {
      setMembers([]);
      return;
    }
    let cancelled = false;
    supabase
      .from("trip_members")
      .select("*")
      .eq("trip_id", tripId)
      .then(({ data }) => {
        if (!cancelled && data) setMembers(data as TripMemberRow[]);
      });
    return () => {
      cancelled = true;
    };
  }, [tripId]);

  const nameFor = (userId: string | null) =>
    members.find((m) => m.user_id === userId)?.display_name ?? "qualcuno del gruppo";

  return { members, nameFor };
}
