import { useEffect, useState, type FormEvent } from "react";
import { Send, Users, KeyRound, Info, Copy, Check } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useTrip } from "@/lib/trip-context";
import { useTripMembers } from "@/hooks/useTripMembers";
import { useUserSettings } from "@/hooks/useUserSettings";
import { useToast } from "@/lib/toast-context";
import { useTheme, type ThemePreference } from "@/lib/theme-context";
import ToggleSwitch from "@/components/ToggleSwitch";
import { supabase } from "@/lib/supabase";
import { env } from "@/lib/env";
import {
  getPushStatus,
  subscribeToPush,
  unsubscribeFromPush,
  getPushSupport,
  type PushStatus,
} from "@/lib/push";
import type { NotificationPrefs } from "@/types/database";

const NOTIFICATION_LABELS: Record<keyof NotificationPrefs, string> = {
  recap: "Recap giornaliero",
  promemoria_30: "Promemoria 30 minuti prima",
  ritardo_5: "Avviso piccolo ritardo (5 min)",
  ritardo_30: "Avviso ritardo importante (30 min)",
  variazione_percorrenza: "Variazioni di traffico",
};

function SectionTitle({ children }: { children: string }) {
  return (
    <h2 className="mb-2 text-xs font-semibold tracking-wide text-[var(--text-muted)] uppercase">
      {children}
    </h2>
  );
}

// Riga "setting-row" piatta (etichetta a sinistra + controllo a destra, senza
// bordo/card) usata da Notifiche/Suoni/Aggiornamenti nel Figma.
function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <span className="text-sm text-[var(--text)]">{label}</span>
      {children}
    </div>
  );
}

function ThemeSwitch() {
  const { theme, setTheme } = useTheme();
  const options: { value: ThemePreference; label: string }[] = [
    { value: "light", label: "Chiaro" },
    { value: "dark", label: "Scuro" },
    { value: "system", label: "Sistema" },
  ];

  return (
    <div className="flex items-start gap-0 rounded-full border border-[var(--border)] bg-[var(--bg)] p-1 shadow-card">
      {options.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          onClick={() => setTheme(value)}
          className={
            "flex flex-1 items-center justify-center rounded-full py-1.5 text-xs font-medium transition-colors " +
            (theme === value
              ? "bg-[var(--bg-elevated)] font-bold text-[var(--text)] shadow-card"
              : "text-[var(--text)]")
          }
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function ChangePasswordForm() {
  const { showToast } = useToast();
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) {
      showToast(`Errore: ${error.message}`);
    } else {
      showToast("Password aggiornata");
      setPassword("");
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3 shadow-card"
    >
      <KeyRound size={18} className="shrink-0 text-[var(--text-muted)]" />
      <input
        type="password"
        required
        minLength={6}
        placeholder="Nuova password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="min-w-0 flex-1 bg-transparent text-sm text-[var(--text)] outline-none"
      />
      <button
        type="submit"
        disabled={saving}
        className="shrink-0 rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--text)] transition-colors hover:bg-[var(--border)] disabled:opacity-60"
      >
        {saving ? "Salvo…" : "Salva"}
      </button>
    </form>
  );
}

function IcsLinkRow() {
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);
  const icsUrl = `${env.supabaseUrl}/functions/v1/ics-feed`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(icsUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast("Non sono riuscito a copiare il link");
    }
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3 shadow-card">
      <div className="min-w-0">
        <p className="text-sm text-[var(--text)]">Feed calendario (.ics)</p>
        <p className="truncate text-xs text-[var(--text-muted)]">{icsUrl}</p>
      </div>
      <button
        type="button"
        onClick={copy}
        className="flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--text)] transition-colors hover:bg-[var(--border)]"
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
        {copied ? "Copiato" : "Copia"}
      </button>
    </div>
  );
}

export default function SettingsPage() {
  const { session } = useAuth();
  const { trip, member } = useTrip();
  const { settings, save } = useUserSettings(session?.user.id ?? null, trip?.id ?? null);
  const { members } = useTripMembers(trip?.id ?? null);
  const { showToast } = useToast();
  const [pushStatus, setPushStatus] = useState<PushStatus>("unsubscribed");
  // "Suoni" e "Aggiornamenti automatici" del Figma non hanno una colonna dati
  // reale nello schema (user_settings ha solo recap/quiet-hours/notification
  // prefs): restano preferenze locali alla sessione, non persistite.
  const [soundsEnabled, setSoundsEnabled] = useState(true);
  const [autoUpdatesEnabled, setAutoUpdatesEnabled] = useState(true);

  useEffect(() => {
    getPushStatus().then(setPushStatus);
  }, []);

  async function sendTestPush() {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;

    try {
      const res = await fetch(`${env.supabaseUrl}/functions/v1/test-push`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        showToast("Notifica di prova inviata");
      } else {
        showToast(`Errore: ${await res.text()}`);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Errore nell'invio della prova");
    }
  }

  async function togglePush() {
    if (!session || !trip) return;
    try {
      if (pushStatus === "subscribed") {
        setPushStatus(await unsubscribeFromPush(session.user.id, trip.id));
      } else {
        const status = await subscribeToPush(session.user.id, trip.id);
        setPushStatus(status);
        if (status === "denied") showToast("Permesso notifiche negato dal browser");
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Errore nell'attivare le notifiche");
    }
  }

  function toggleNotificationPref(key: keyof NotificationPrefs) {
    if (!settings) return;
    save({ notification_prefs: { ...settings.notification_prefs, [key]: !settings.notification_prefs[key] } });
  }

  if (!settings) return null;

  const initial = (member?.display_name || session?.user.email || "?").slice(0, 1).toUpperCase();

  return (
    <div className="animate-page flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center px-5 pt-4 pb-2">
        <h1 className="text-sm font-semibold text-[var(--text)]">Impostazioni</h1>
      </div>

      {/* Profilo (sezione "profile-section" del Figma): iniziale reale al
          posto di una foto (l'app non ha avatar caricati). */}
      <div className="flex shrink-0 items-center gap-4 px-5 pb-2">
        <span
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-sm font-semibold text-white"
          aria-hidden
        >
          {initial}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[var(--text)]">
            {member?.display_name || "Viaggiatore"}
          </p>
          <p className="truncate text-xs text-[var(--text-muted)]">{session?.user.email}</p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-4 pb-[calc(6rem+env(safe-area-inset-bottom))]">
        <section className="mb-2">
          <p className="mb-2 text-center text-xs font-semibold text-[var(--text)]">ASPETTO</p>
          <ThemeSwitch />
        </section>

        <section className="border-t border-[var(--border)]">
          <SettingRow label="Notifiche">
            {getPushSupport() ? (
              <ToggleSwitch
                checked={pushStatus === "subscribed"}
                onChange={togglePush}
                label="Notifiche push"
              />
            ) : (
              <span className="text-xs text-[var(--text-muted)]">Non supportate</span>
            )}
          </SettingRow>

          {!getPushSupport() && (
            <p className="pb-2 text-xs text-[var(--text-muted)]">
              Su iOS, installa l'app sulla schermata Home da Safari per abilitarle.
            </p>
          )}

          {pushStatus === "subscribed" && (
            <div className="flex flex-col pt-1 pb-2">
              <p className="text-[11px] text-[var(--text-muted)]">
                Seleziona le notifiche che vuoi ricevere
              </p>
              {(Object.keys(NOTIFICATION_LABELS) as (keyof NotificationPrefs)[]).map((key) => (
                <div key={key} className="flex items-center justify-between py-2.5 pl-6">
                  <span className="flex-1 text-sm text-[var(--text-muted)]">
                    {NOTIFICATION_LABELS[key]}
                  </span>
                  <ToggleSwitch
                    checked={settings.notification_prefs[key]}
                    onChange={() => toggleNotificationPref(key)}
                    label={NOTIFICATION_LABELS[key]}
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={sendTestPush}
                className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border)] px-4 py-2.5 text-sm text-[var(--text-muted)]"
              >
                <Send size={15} /> Invia notifica di prova
              </button>
            </div>
          )}
        </section>

        <section className="border-t border-[var(--border)]">
          <SettingRow label="Suoni">
            <ToggleSwitch checked={soundsEnabled} onChange={setSoundsEnabled} label="Suoni" />
          </SettingRow>
        </section>

        <section className="mb-6 border-t border-b border-[var(--border)]">
          <SettingRow label="Aggiornamenti automatici">
            <ToggleSwitch
              checked={autoUpdatesEnabled}
              onChange={setAutoUpdatesEnabled}
              label="Aggiornamenti automatici"
            />
          </SettingRow>
        </section>

        <section className="mb-6">
          <SectionTitle>Recap giornaliero</SectionTitle>
          <label className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-sm text-[var(--text)] shadow-card">
            Orario
            <input
              type="time"
              value={settings.daily_recap_time.slice(0, 5)}
              onChange={(e) => save({ daily_recap_time: `${e.target.value}:00` })}
              className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-sm text-[var(--text)]"
            />
          </label>
        </section>

        <section className="mb-6">
          <SectionTitle>Orario di silenzio</SectionTitle>
          <div className="flex flex-col gap-2">
            <label className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-sm text-[var(--text)] shadow-card">
              Da
              <input
                type="time"
                value={settings.quiet_hours_start.slice(0, 5)}
                onChange={(e) => save({ quiet_hours_start: `${e.target.value}:00` })}
                className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-sm text-[var(--text)]"
              />
            </label>
            <label className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-sm text-[var(--text)] shadow-card">
              A
              <input
                type="time"
                value={settings.quiet_hours_end.slice(0, 5)}
                onChange={(e) => save({ quiet_hours_end: `${e.target.value}:00` })}
                className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-sm text-[var(--text)]"
              />
            </label>
          </div>
        </section>

        <section className="mb-6">
          <SectionTitle>Gruppo</SectionTitle>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3 shadow-card">
            {members.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                <Users size={16} /> Nessun altro membro ancora.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {members.map((m) => (
                  <li key={m.id} className="flex items-center gap-2 text-sm text-[var(--text)]">
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-xs font-semibold text-white"
                      aria-hidden
                    >
                      {m.display_name.slice(0, 1).toUpperCase()}
                    </span>
                    {m.display_name}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="mb-6">
          <SectionTitle>Account</SectionTitle>
          <ChangePasswordForm />
        </section>

        <section>
          <SectionTitle>Info app</SectionTitle>
          <div className="flex flex-col gap-2">
            <IcsLinkRow />
            <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-sm text-[var(--text-muted)] shadow-card">
              <Info size={16} className="shrink-0" />
              Scozia 2026 — diario di viaggio
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
