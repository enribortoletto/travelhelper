/**
 * Condivide un evento (Web Share API se disponibile, altrimenti copia il
 * link negli appunti). Restituisce come è andata, per mostrare un feedback
 * coerente all'utente.
 */
export async function shareEvent(
  title: string,
  url: string,
  text?: string,
): Promise<"shared" | "copied" | "cancelled" | "failed"> {
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return "shared";
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return "cancelled";
      return "failed";
    }
  }

  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "failed";
  }
}
