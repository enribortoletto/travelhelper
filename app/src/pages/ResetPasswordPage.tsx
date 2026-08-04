import { useState, type FormEvent } from "react";
import { MapPin } from "lucide-react";
import { supabase } from "@/lib/supabase";

// Completa il flusso "recupera password" di Supabase: quando l'utente apre
// il link ricevuto via email, il client stabilisce automaticamente una
// sessione di recupero (detectSessionInUrl, attivo di default); qui basta
// impostare la nuova password su quella sessione.
export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("saving");
    setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message);
      setStatus("error");
    } else {
      setStatus("done");
    }
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-8 text-center">
      <MapPin size={40} className="text-[var(--primary)]" strokeWidth={1.75} />
      <div>
        <h1 className="text-xl font-bold text-[var(--text)]">Imposta la password</h1>
      </div>

      {status === "done" ? (
        <p className="text-sm text-[var(--primary)]">
          Fatto! Ora puoi accedere con questa password. Torna alla pagina principale.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="flex w-full max-w-xs flex-col gap-3">
          <input
            type="password"
            required
            minLength={6}
            placeholder="Nuova password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-2xl border-none bg-[var(--bg-elevated)] px-4 py-3 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-[var(--primary)]"
            autoFocus
          />
          <button
            type="submit"
            disabled={status === "saving"}
            className="rounded-2xl border border-[var(--primary)] bg-[var(--primary)] px-6 py-3 text-sm font-semibold text-white shadow-card transition-colors hover:brightness-110 disabled:opacity-60"
          >
            {status === "saving" ? "Salvataggio…" : "Salva password"}
          </button>
          {error && <p className="text-sm font-semibold text-[var(--text)]">{error}</p>}
        </form>
      )}
    </div>
  );
}
