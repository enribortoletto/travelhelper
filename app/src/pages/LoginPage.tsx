import { useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { MapPin } from "lucide-react";

// Account condiviso "temporaneo" (una sola password per tutto il gruppo) —
// da sostituire con l'accesso via magic link per-persona quando l'app sarà
// pronta per l'uso vero. In sandbox Resend può consegnare solo all'email
// esatta del proprietario dell'account, quindi qui non si può usare un
// alias "+" o un indirizzo diverso finché non si verifica un dominio.
const SHARED_EMAIL = "enricobortoletto@gmail.com";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: SHARED_EMAIL,
      password,
    });
    if (error) {
      setError("Password errata, riprova.");
      setStatus("error");
    }
    // Se non c'è errore, onAuthStateChange in auth-context aggiorna la
    // sessione e AppShell smette di mostrare questa pagina da solo.
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-8 text-center">
      <MapPin size={40} className="text-[var(--primary)]" strokeWidth={1.75} />
      <div>
        <h1 className="text-xl font-bold text-[var(--text)]">Scozia, 10–16 agosto 2026</h1>
        <p className="mt-1.5 text-sm text-[var(--text-muted)]">
          Inserisci la password del gruppo per vedere l'itinerario.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex w-full max-w-xs flex-col gap-3">
        <input
          type="password"
          required
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-2xl border-none bg-[var(--bg-elevated)] px-4 py-3 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-[var(--primary)]"
          autoFocus
        />
        <button
          type="submit"
          disabled={status === "sending"}
          className="rounded-2xl border border-[var(--primary)] bg-[var(--primary)] px-6 py-3 text-sm font-semibold text-white shadow-card transition-colors hover:brightness-110 disabled:opacity-60"
        >
          {status === "sending" ? "Accesso in corso…" : "Accedi"}
        </button>
        {error && <p className="text-sm font-semibold text-[var(--text)]">{error}</p>}
      </form>
    </div>
  );
}
