import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "./supabase";
import { useAuth } from "./auth-context";
import type { TripRow, TripMemberRow } from "@/types/database";

interface TripContextValue {
  trip: TripRow | null;
  member: TripMemberRow | null;
  loading: boolean;
  error: string | null;
}

const TripContext = createContext<TripContextValue>({
  trip: null,
  member: null,
  loading: true,
  error: null,
});

export function TripProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [trip, setTrip] = useState<TripRow | null>(null);
  const [member, setMember] = useState<TripMemberRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) {
      setTrip(null);
      setMember(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      setLoading(true);
      const { data: memberRow, error: memberError } = await supabase
        .from("trip_members")
        .select("*")
        .eq("user_id", session.user.id)
        .limit(1)
        .maybeSingle();

      if (cancelled) return;

      if (memberError || !memberRow) {
        setError(
          memberError?.message ??
            "Nessun viaggio associato a questo account: chiedi a chi organizza di aggiungerti a trip_invites.",
        );
        setLoading(false);
        return;
      }

      const { data: tripRow, error: tripError } = await supabase
        .from("trips")
        .select("*")
        .eq("id", memberRow.trip_id)
        .single();

      if (cancelled) return;

      if (tripError || !tripRow) {
        setError(tripError?.message ?? "Viaggio non trovato.");
        setLoading(false);
        return;
      }

      setMember(memberRow as TripMemberRow);
      setTrip(tripRow as TripRow);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [session]);

  return (
    <TripContext.Provider value={{ trip, member, loading, error }}>
      {children}
    </TripContext.Provider>
  );
}

export function useTrip() {
  return useContext(TripContext);
}
