import { useEffect, useState } from "react";
import { X, Share, PlusSquare } from "lucide-react";

const DISMISSED_KEY = "install-prompt-dismissed";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  const ua = navigator.userAgent;
  const isAppleTouch = /iPad|iPhone|iPod/.test(ua);
  const isIpadOsAsMac = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return isAppleTouch || isIpadOsAsMac;
}

/**
 * Prompt di installazione PWA (03-integrations.md): mostra istruzioni su iOS
 * (Safari non espone un prompt nativo) e il prompt nativo su Android/Chrome.
 * Compare una volta sola: la scelta dell'utente resta in localStorage.
 */
export default function InstallPrompt() {
  const [visible, setVisible] = useState(false);
  const [platform, setPlatform] = useState<"ios" | "android" | null>(null);
  const [deferredEvent, setDeferredEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (localStorage.getItem(DISMISSED_KEY) || isStandalone()) return;

    if (isIos()) {
      setPlatform("ios");
      setVisible(true);
      return;
    }

    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setDeferredEvent(e as BeforeInstallPromptEvent);
      setPlatform("android");
      setVisible(true);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, "true");
    setVisible(false);
  }

  async function installAndroid() {
    if (!deferredEvent) return;
    await deferredEvent.prompt();
    await deferredEvent.userChoice;
    dismiss();
  }

  if (!visible) return null;

  return (
    <div className="absolute inset-x-3 bottom-20 z-40 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-4 shadow-lg">
      <button
        type="button"
        onClick={dismiss}
        className="absolute top-2 right-2 rounded-full p-1 text-[var(--text-muted)] hover:bg-[var(--border)]"
        aria-label="Chiudi"
      >
        <X size={16} />
      </button>

      {platform === "ios" ? (
        <div className="pr-6 text-sm">
          <p className="font-medium text-[var(--text)]">Installa l'app sulla schermata Home</p>
          <p className="mt-1.5 flex items-center gap-1.5 text-[var(--text-muted)]">
            Tocca <Share size={15} className="inline shrink-0" /> Condividi, poi{" "}
            <PlusSquare size={15} className="inline shrink-0" /> "Aggiungi a Home".
          </p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Serve per ricevere le notifiche push su iPhone/iPad.
          </p>
        </div>
      ) : (
        <div className="pr-6 text-sm">
          <p className="font-medium text-[var(--text)]">Installa l'app</p>
          <p className="mt-1 text-[var(--text-muted)]">
            Accesso più rapido e notifiche push dalla schermata Home.
          </p>
          <button
            type="button"
            onClick={installAndroid}
            className="mt-3 rounded-full border border-[var(--primary)] bg-[var(--primary)] px-5 py-2 text-sm font-semibold text-white shadow-card transition-colors hover:brightness-110"
          >
            Installa
          </button>
        </div>
      )}
    </div>
  );
}
