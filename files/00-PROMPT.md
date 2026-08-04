# Prompt di avvio per Claude Code

Incolla questo messaggio come primo prompt in Claude Code, nella cartella del nuovo progetto, insieme ai file di questa cartella e al file Excel `Viaggio_Scozia_Eventi.xlsx`.

---

Voglio costruire una web app (PWA) che sia il diario di viaggio interattivo per un viaggio di famiglia/gruppo in Scozia dal 10 al 16 agosto 2026. Leggi tutti i file `.md` in questa cartella prima di scrivere qualunque codice: contengono le specifiche complete (modello dati, flussi UX, integrazioni, regole di notifica, e il comportamento dell'assistente AI). Il file `Viaggio_Scozia_Eventi.xlsx` contiene i dati reali del viaggio (foglio "Piano di viaggio" per la vista leggibile, foglio "Eventi" per i dati strutturati completi da usare come seed).

## Stack

- Frontend: React + Tailwind CSS
- Backend/DB: Supabase (Postgres + Auth + Realtime + Edge Functions)
- Mappe: Google Maps Platform (Maps JavaScript API, Directions API, Places API)
- Calendario: generazione/aggiornamento di un feed .ics pubblico
- Notifiche push: Web Push tramite Service Worker (PWA installabile su iOS 16.4+)
- AI: Claude (Anthropic API) via Supabase Edge Function, con tool `web_search` abilitato, per il comportamento descritto in `04-ai-assistant.md`

## Ordine di lavoro richiesto

1. Leggi `01-data-model.md`, `02-ux-flows.md`, `03-integrations.md`, `04-ai-assistant.md`, `05-notification-rules.md`.
2. Proponimi lo schema Supabase definitivo (tabelle, RLS policy per accesso di gruppo) prima di generare le migration — voglio poterlo verificare.
3. Importa i dati da `Viaggio_Scozia_Eventi.xlsx` (foglio "Eventi") come seed iniziale, mappando le colonne come descritto in `01-data-model.md`.
4. Costruisci le 3 sezioni dell'app descritte in `02-ux-flows.md` (Oggi, Viaggio, Calendario).
5. Implementa l'integrazione Google Maps e il calcolo tempi in tempo reale.
6. Implementa il feed .ics e le notifiche push secondo `05-notification-rules.md`.
7. Implementa l'assistente AI di modifica itinerario descritto in `04-ai-assistant.md` — è la funzionalità più delicata, fammi vedere un piano prima di implementarla.
8. Solo alla fine, occupati di rifinitura visiva e PWA install prompt.

Fammi domande se qualcosa nei file `.md` non è chiaro invece di assumere. Se una scelta implica un costo (es. una API a pagamento oltre le free tier di Google Maps/Supabase), segnalamelo prima di procedere.
