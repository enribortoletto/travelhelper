import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/lib/toast-context";
import { useTripMembers } from "./useTripMembers";
import type { EventRow } from "@/types/database";

export function useEvents(tripId: string | null) {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const { session } = useAuth();
  const { showToast } = useToast();
  const { nameFor } = useTripMembers(tripId);

  // La sottoscrizione realtime qui sotto viene creata una sola volta per
  // trip/sessione (l'effect non dipende da nameFor/showToast, altrimenti si
  // ricrea il canale ad ogni variazione dei membri). Un ref tiene sempre
  // l'ultima versione di entrambi, così il toast mostra il nome vero anche
  // se arriva dopo che i membri sono stati caricati, invece di restare
  // agganciato al fallback "qualcuno del gruppo" catturato al primo giro.
  const latest = useRef({ nameFor, showToast });
  latest.current = { nameFor, showToast };

  useEffect(() => {
    if (!tripId) {
      setEvents([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    supabase
      .from("events")
      .select("*")
      .eq("trip_id", tripId)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error && data) setEvents(data as EventRow[]);
        setLoading(false);
      });

    const channel = supabase
      .channel(`events-trip-${tripId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "events", filter: `trip_id=eq.${tripId}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as EventRow | undefined;
          if (!row) return;

          if (payload.eventType === "INSERT") {
            setEvents((prev) => [...prev, payload.new as EventRow]);
          } else if (payload.eventType === "UPDATE") {
            setEvents((prev) =>
              prev.map((e) => (e.id === row.id ? (payload.new as EventRow) : e)),
            );
          } else if (payload.eventType === "DELETE") {
            setEvents((prev) => prev.filter((e) => e.id !== row.id));
          }

          const actorId = (payload.new as EventRow | null)?.updated_by ?? null;
          if (actorId && actorId !== session?.user.id) {
            latest.current.showToast(`Aggiornato da ${latest.current.nameFor(actorId)}`);
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, session?.user.id]);

  return { events, loading };
}
