import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";
import type { UserSettingsRow } from "@/types/database";

const DEFAULTS: Omit<UserSettingsRow, "user_id" | "trip_id" | "updated_at"> = {
  daily_recap_time: "08:00:00",
  quiet_hours_start: "22:00:00",
  quiet_hours_end: "08:00:00",
  push_subscription: null,
  notification_prefs: {
    recap: true,
    promemoria_30: true,
    ritardo_5: true,
    ritardo_30: true,
    variazione_percorrenza: true,
  },
};

export function useUserSettings(userId: string | null, tripId: string | null) {
  const [settings, setSettings] = useState<UserSettingsRow | null>(null);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  useEffect(() => {
    if (!userId || !tripId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", userId)
      .eq("trip_id", tripId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const row = data as UserSettingsRow | null;
        setSettings(
          row
            ? { ...row, notification_prefs: { ...DEFAULTS.notification_prefs, ...row.notification_prefs } }
            : { user_id: userId, trip_id: tripId, updated_at: new Date().toISOString(), ...DEFAULTS },
        );
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, tripId]);

  async function save(patch: Partial<UserSettingsRow>) {
    if (!userId || !tripId) return;
    const previous = settings;
    const next = { ...settings, ...patch, user_id: userId, trip_id: tripId } as UserSettingsRow;
    setSettings(next);
    const { error } = await supabase.from("user_settings").upsert(
      {
        user_id: userId,
        trip_id: tripId,
        daily_recap_time: next.daily_recap_time,
        quiet_hours_start: next.quiet_hours_start,
        quiet_hours_end: next.quiet_hours_end,
        notification_prefs: next.notification_prefs,
      },
      { onConflict: "user_id,trip_id" },
    );
    // Scrittura ottimistica: se il salvataggio fallisce davvero (non solo
    // localmente ma sul server), si torna al valore precedente invece di
    // lasciare l'UI a mostrare una preferenza che non è mai stata salvata.
    if (error) {
      setSettings(previous);
      showToast("Impossibile salvare le impostazioni, riprova");
    }
  }

  return { settings, loading, save };
}
