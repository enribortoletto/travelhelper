import { supabase } from "./supabase";
import { env } from "./env";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export type PushStatus = "unsupported" | "denied" | "unsubscribed" | "subscribed";

export function getPushSupport(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window;
}

export async function getPushStatus(): Promise<PushStatus> {
  if (!getPushSupport()) return "unsupported";
  if (Notification.permission === "denied") return "denied";

  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  return subscription ? "subscribed" : "unsubscribed";
}

export async function subscribeToPush(userId: string, tripId: string): Promise<PushStatus> {
  if (!getPushSupport()) return "unsupported";
  if (!env.vapidPublicKey) {
    throw new Error("VITE_VAPID_PUBLIC_KEY non configurata");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";

  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(env.vapidPublicKey) as BufferSource,
  });

  const { error } = await supabase.from("user_settings").upsert(
    {
      user_id: userId,
      trip_id: tripId,
      push_subscription: subscription.toJSON(),
    },
    { onConflict: "user_id,trip_id" },
  );
  if (error) throw error;

  return "subscribed";
}

export async function unsubscribeFromPush(userId: string, tripId: string): Promise<PushStatus> {
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) await subscription.unsubscribe();

  const { error } = await supabase
    .from("user_settings")
    .update({ push_subscription: null })
    .eq("user_id", userId)
    .eq("trip_id", tripId);
  if (error) throw error;

  return "unsubscribed";
}
