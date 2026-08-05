import { useEffect, useState } from "react";
import { Card } from "../ui/Card";
import { TextField } from "../ui/TextField";
import {
  getUserSettings,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  savePushSubscription,
  clearPushSubscription,
  updateNotificationPrefs,
  updateQuietHours,
} from "../../lib/notifications";
import { isPushSupported, pushRequiresInstallFirst, subscribeToPush, unsubscribeFromPush } from "../../lib/push";
import { useAuth } from "../../lib/auth-context";
import type { NotificationLogRow, NotificationPrefs, UserSettings } from "../../lib/types";

const RULE_LABELS: Record<keyof NotificationPrefs, string> = {
  recap: "Daily recap",
  reminder_before_start: "Reminder before a stop starts",
  short_delay: "Short travel delay",
  long_delay: "Long travel delay",
  travel_time_variation: "Travel time changed vs. plan",
};

const DEFAULT_PREFS: NotificationPrefs = {
  recap: true,
  reminder_before_start: true,
  short_delay: true,
  long_delay: true,
  travel_time_variation: true,
};

export function AlertsPanel({ tripId }: { tripId: string }) {
  const { user } = useAuth();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [notifications, setNotifications] = useState<NotificationLogRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setSettings(await getUserSettings(tripId, user.id));
      setNotifications(await listNotifications(tripId));
    })();
  }, [tripId, user]);

  if (!user) return null;

  const subscribed = !!settings?.push_subscription;
  const prefs = settings?.notification_prefs ?? DEFAULT_PREFS;
  const unreadCount = notifications.filter((n) => !n.read_at).length;

  async function handleEnable() {
    setError(null);
    setBusy(true);
    try {
      const subscription = await subscribeToPush();
      await savePushSubscription(tripId, user!.id, subscription as unknown as object);
      setSettings(await getUserSettings(tripId, user!.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not enable notifications.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable() {
    setBusy(true);
    try {
      await unsubscribeFromPush();
      await clearPushSubscription(tripId, user!.id);
      setSettings(await getUserSettings(tripId, user!.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not disable notifications.");
    } finally {
      setBusy(false);
    }
  }

  async function handleTogglePref(key: keyof NotificationPrefs) {
    const next = { ...prefs, [key]: !prefs[key] };
    setSettings((prev) => (prev ? { ...prev, notification_prefs: next } : prev));
    await updateNotificationPrefs(tripId, user!.id, { [key]: next[key] });
  }

  async function handleQuietHoursChange(field: "quiet_hours_start" | "quiet_hours_end" | "daily_recap_time", value: string) {
    const withSeconds = `${value}:00`;
    setSettings((prev) => (prev ? { ...prev, [field]: withSeconds } : prev));
    await updateQuietHours(tripId, user!.id, { [field]: withSeconds });
  }

  async function handleMarkRead(id: string) {
    await markNotificationRead(id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)));
  }

  async function handleMarkAllRead() {
    await markAllNotificationsRead(tripId);
    setNotifications((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
  }

  return (
    <div className="flex flex-col gap-4">
      <Card size="sm" className="flex flex-col gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-text-secondary">Push notifications</p>

        {!isPushSupported() ? (
          <p className="text-xs text-text-secondary">Push notifications aren't supported on this device/browser.</p>
        ) : pushRequiresInstallFirst() ? (
          <p className="text-xs text-text-secondary">
            Add Trip Companion to your home screen first (Share → Add to Home Screen), then open it from there to
            enable notifications.
          </p>
        ) : subscribed ? (
          <button
            onClick={handleDisable}
            disabled={busy}
            className="h-10 rounded-input bg-surface-2 text-xs font-semibold text-text-primary"
          >
            {busy ? "Working…" : "Disable notifications on this device"}
          </button>
        ) : (
          <button
            onClick={handleEnable}
            disabled={busy}
            className="h-10 rounded-input bg-brand text-xs font-semibold text-bg"
          >
            {busy ? "Working…" : "Enable notifications on this device"}
          </button>
        )}
        {error && <p className="text-xs text-accent">{error}</p>}
      </Card>

      {subscribed && (
        <Card size="sm" className="flex flex-col gap-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-text-secondary">Alert types</p>
          {(Object.keys(RULE_LABELS) as (keyof NotificationPrefs)[]).map((key) => (
            <label key={key} className="flex items-center justify-between text-xs text-text-primary">
              {RULE_LABELS[key]}
              <input type="checkbox" checked={prefs[key]} onChange={() => handleTogglePref(key)} />
            </label>
          ))}

          <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-text-secondary">Quiet hours</p>
          <div className="flex gap-3">
            <TextField
              label="From"
              type="time"
              className="flex-1"
              value={settings?.quiet_hours_start?.slice(0, 5) ?? "22:00"}
              onChange={(e) => handleQuietHoursChange("quiet_hours_start", e.target.value)}
            />
            <TextField
              label="To"
              type="time"
              className="flex-1"
              value={settings?.quiet_hours_end?.slice(0, 5) ?? "08:00"}
              onChange={(e) => handleQuietHoursChange("quiet_hours_end", e.target.value)}
            />
          </div>
          <TextField
            label="Daily recap time"
            type="time"
            value={settings?.daily_recap_time?.slice(0, 5) ?? "07:30"}
            onChange={(e) => handleQuietHoursChange("daily_recap_time", e.target.value)}
          />
        </Card>
      )}

      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
          History{unreadCount > 0 ? ` (${unreadCount} unread)` : ""}
        </p>
        {unreadCount > 0 && (
          <button onClick={handleMarkAllRead} className="text-xs font-semibold text-brand">
            Mark all read
          </button>
        )}
      </div>

      {notifications.length === 0 && (
        <Card size="sm">
          <p className="text-xs text-text-secondary">No notifications yet.</p>
        </Card>
      )}

      <div className="flex flex-col gap-2">
        {notifications.map((n) => (
          <Card
            key={n.id}
            size="sm"
            className={`flex flex-col gap-1 ${!n.read_at ? "border border-brand" : ""}`}
            onClick={() => !n.read_at && handleMarkRead(n.id)}
          >
            <p className="text-sm font-semibold text-text-primary">{n.title}</p>
            <p className="text-xs text-text-secondary">{n.body}</p>
            <p className="text-[10px] text-text-tertiary">{new Date(n.created_at).toLocaleString()}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
