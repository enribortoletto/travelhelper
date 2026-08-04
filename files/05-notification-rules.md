# Regole di notifica

Push su iOS (PWA installata) e Android.

1. **Recap giornaliero**: una volta al giorno, all'orario scelto da ciascun utente nelle impostazioni. Contenuto: lista delle tappe "nel piano" della giornata con orari.
2. **Promemoria 30 minuti prima**: per ogni evento con `start_time` valido, o 30 minuti prima dell'orario di partenza consigliato per una tappa "trasporto"/spostamento in auto.
3. **Ritardo 5 minuti**: se l'ora corrente supera di 5 minuti l'orario pianificato di un evento "in corso" senza che sia stato marcato come iniziato/saltato, ricalcola il tempo di spostamento verso la tappa successiva (Directions API) e notifica lo scostamento.
4. **Ritardo 30 minuti**: stessa logica del punto 3 con soglia 30 minuti, notifica più prominente e suggerimento di attivare il Flusso 2 di `04-ai-assistant.md` (ricalcolo dell'intera giornata).
5. **Variazione tempo di percorrenza**: se Directions API segnala un cambiamento significativo (traffico, incidente) sul prossimo spostamento in programma rispetto alla stima originale, notifica con il nuovo tempo stimato.

Tutte le notifiche vanno deduplicate per evento (non ripetere lo stesso alert più volte) e rispettare un orario di silenzio ragionevole di default (es. 22:00-08:00), configurabile.
