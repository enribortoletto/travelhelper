import { supabase } from "./supabase";
import type { NotificationLogRow, NotificationPrefs, UserSettings } from "./types";

export async function getUserSettings(tripId: string, userId: string): Promise<UserSettings | null> {
  const { data, error } = await supabase
    .from("user_settings")
    .select("*")
    .eq("trip_id", tripId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Saves the current device's push subscription for this trip (§11 — subscription is stored per (user, trip)). */
export async function savePushSubscription(tripId: string, userId: string, subscription: object): Promise<void> {
  const { error } = await supabase
    .from("user_settings")
    .upsert({ trip_id: tripId, user_id: userId, push_subscription: subscription }, { onConflict: "user_id,trip_id" });
  if (error) throw error;
}

export async function clearPushSubscription(tripId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("user_settings")
    .upsert({ trip_id: tripId, user_id: userId, push_subscription: null }, { onConflict: "user_id,trip_id" });
  if (error) throw error;
}

export async function updateNotificationPrefs(
  tripId: string,
  userId: string,
  prefs: Partial<NotificationPrefs>,
): Promise<void> {
  const current = await getUserSettings(tripId, userId);
  const merged = { ...(current?.notification_prefs ?? {}), ...prefs };
  const { error } = await supabase
    .from("user_settings")
    .upsert({ trip_id: tripId, user_id: userId, notification_prefs: merged }, { onConflict: "user_id,trip_id" });
  if (error) throw error;
}

export async function updateQuietHours(
  tripId: string,
  userId: string,
  input: { quiet_hours_start?: string; quiet_hours_end?: string; daily_recap_time?: string },
): Promise<void> {
  const { error } = await supabase
    .from("user_settings")
    .upsert({ trip_id: tripId, user_id: userId, ...input }, { onConflict: "user_id,trip_id" });
  if (error) throw error;
}

export async function listNotifications(tripId: string): Promise<NotificationLogRow[]> {
  const { data, error } = await supabase
    .from("notification_log")
    .select("*")
    .eq("trip_id", tripId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabase.from("notification_log").update({ read_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

export async function markAllNotificationsRead(tripId: string): Promise<void> {
  const { error } = await supabase
    .from("notification_log")
    .update({ read_at: new Date().toISOString() })
    .eq("trip_id", tripId)
    .is("read_at", null);
  if (error) throw error;
}
