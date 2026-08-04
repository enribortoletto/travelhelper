# Integrazioni

## Google Maps

- Maps JavaScript API per le mappe di "Oggi" e "Viaggio".
- Places API per recuperare dettagli di un luogo dato un `place_id` (orari, prezzo se disponibile, foto).
- Directions API per calcolare in tempo reale il tempo di percorrenza tra la posizione attuale dell'utente (o la tappa precedente) e la prossima tappa. Questo tempo va mostrato nel dettaglio evento e usato dal motore di ricalcolo (vedi `04-ai-assistant.md`).
- Deep link "Apri in Google Maps": su iOS/Android deve aprire l'app Google Maps (o il browser come fallback) con navigazione già impostata verso il `place_id` dell'evento.
- La mappa originale condivisa da cui sono stati importati i pin (lista "Scozia" su Google Maps) non è raggiungibile via API pubblica in modo affidabile — è stata letta manualmente per costruire il seed data; non serve una sincronizzazione live con quella lista.

## Calendario .ics

- Genera un feed .ics pubblico (URL statico, aggiornato ad ogni modifica) leggibile da app calendario esterne (Google Calendar, Apple Calendar).
- Ogni evento con `status_plan = nel_piano` e un `day`+`start_time` validi diventa un VEVENT. Gli eventi facoltativi o senza giorno assegnato non entrano nel feed.
- Il feed deve rigenerarsi automaticamente ad ogni modifica salvata (trigger su Supabase, o rigenerazione on-demand alla richiesta del feed con cache breve).

## Notifiche push

- PWA installabile su home screen (richiesto per push su iOS 16.4+). Mostra un prompt di installazione la prima volta che l'utente apre l'app da Safari, con istruzioni.
- Service Worker + Web Push standard. Le regole di invio sono in `05-notification-rules.md`.
- Ogni utente può impostare l'orario del recap giornaliero nelle impostazioni personali.

## Assistente AI

Vedi `04-ai-assistant.md` — usa l'Anthropic API da una Supabase Edge Function (mai dal client, per non esporre la chiave). Il tool `web_search` va abilitato lato Anthropic API per permettere all'assistente di cercare informazioni reali su nuove tappe.
