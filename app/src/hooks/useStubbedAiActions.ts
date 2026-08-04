import { useToast } from "@/lib/toast-context";

// "Modifica", "Elimina", "Segna come in ritardo" e le azioni di pianificazione
// rapida (riordino, cambio orario, aggiunta, salvataggio) per specifica
// (04-ai-assistant.md) devono sempre passare dalla preview dell'assistente
// AI, non scrivere mai direttamente su `events`. Finché l'assistente non è
// implementato (task dedicato, da approvare separatamente) queste azioni
// sono presenti ma stub: confermano l'intento con un toast invece di
// mutare i dati. Hook condiviso da EventDetailSheet e CompactPlannerPage
// per restare coerenti sull'unico punto di stub.
export function useStubbedAiActions() {
  const { showToast } = useToast();
  return {
    edit: () => showToast("Modifica: disponibile con l'assistente AI (prossimo step)"),
    remove: () => showToast("Eliminazione: disponibile con l'assistente AI (prossimo step)"),
    markLate: () => showToast("Ritardo: disponibile con l'assistente AI (prossimo step)"),
    reorder: () => showToast("Riordino: disponibile con l'assistente AI (prossimo step)"),
    changeTime: () => showToast("Cambio orario: disponibile con l'assistente AI (prossimo step)"),
    add: () => showToast("Aggiunta tappa: disponibile con l'assistente AI (prossimo step)"),
    save: () => showToast("Salvataggio: disponibile con l'assistente AI (prossimo step)"),
  };
}
