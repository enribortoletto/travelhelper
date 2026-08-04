/**
 * Feedback aptico leggero (Vibration API) su azioni importanti. Non tutti i
 * browser/dispositivi la supportano (es. iOS Safari non la espone ancora):
 * la funzione diventa semplicemente un no-op lì, nessun controllo esplicito
 * necessario a chi la chiama.
 */
function vibrate(pattern: number | number[]) {
  if ("vibrate" in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {
      // ignorato: mai bloccare un'azione per un fallimento aptico
    }
  }
}

export const haptics = {
  light: () => vibrate(10),
  success: () => vibrate([10, 40, 10]),
  warning: () => vibrate([20, 30, 20, 30, 20]),
};
