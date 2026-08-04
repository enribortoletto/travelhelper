# Assistente AI di modifica itinerario

Questa è la funzionalità che rende l'app "viva": ogni modifica che un utente fa nell'app viene interpretata da Claude (via Anthropic API, tool `web_search` abilitato) che aggiorna contenuti e tempistiche, mostrando sempre un'anteprima prima di salvare.

## Principio generale: mai salvare senza preview

Qualunque modifica innescata dai flussi sotto genera prima una **preview** (un oggetto temporaneo, non ancora scritto su `events`): il nuovo stato del giorno coinvolto, evidenziando cosa cambia rispetto a prima (vecchio orario → nuovo orario, tappe spostate, eventuali conflitti rilevati). L'utente conferma o annulla. Solo alla conferma si scrive su `events` e si logga su `itinerary_change_log`.

## Flusso 1 — Aggiunta di una tappa

Trigger: l'utente aggiunge una tappa (per nome, o incollando un link Google Maps, o un `place_id`).

1. L'Edge Function chiama Claude con il tool `web_search` (e se disponibile una tool call a Google Places) per recuperare: posizione, categoria plausibile, orari di apertura, prezzo, una breve descrizione, tempo di visita consigliato.
2. Claude propone dove inserire la tappa nella giornata scelta, calcolando i tempi di guida (Directions API) da/verso le tappe adiacenti già in programma, **includendo ~15 minuti di pausa ogni ora di guida** sulle tratte superiori a ~20-25 minuti — stessa regola già applicata manualmente nel piano di viaggio (vedi Excel).
3. Verifica automaticamente conflitti con gli orari di apertura reali del luogo e con gli altri eventi già fissati quel giorno (es. un check-in, un orario di chiusura di un ristorante) — se c'è un conflitto, Claude non lo ignora: lo segnala esplicitamente nella preview con un'alternativa (es. "chiude alle 18:00, prima della tua cena delle 19:00 — vuoi spostarla al pomeriggio?").
4. Mostra la preview con il giorno intero ricalcolato.

## Flusso 2 — Rimozione di una tappa o ritardo segnalato

Trigger: l'utente elimina una tappa, oppure preme "Segna come in ritardo" su una tappa in corso specificando i minuti di ritardo (o l'app lo rileva da sola confrontando l'ora corrente con l'orario pianificato, se l'utente ha condiviso la posizione — opzionale, non bloccante per la v1).

1. Ricalcola in cascata tutti gli eventi successivi dello stesso giorno: ogni tappa dopo quella eliminata/ritardata trasla dell'offset corrispondente (usando i tempi di guida reali già noti, non serve richiamare `web_search` qui — è puro calcolo).
2. Se il ritardo accumulato mette a rischio un orario fisso della giornata (chiusura di un luogo, check-in con orario limite, prenotazione ristorante), Claude lo segnala e propone cosa tagliare o comprimere, sullo stesso modello delle correzioni fatte manualmente in questo progetto (es. quando abbiamo scoperto che Annie's Bakery chiudeva prima dell'orario programmato).
3. Preview del giorno aggiornato, con le tappe a rischio evidenziate.

## Flusso 3 — Modifica manuale di un orario

Trigger: l'utente trascina/modifica l'orario di una tappa nel Calendario.

1. Stesso ricalcolo a cascata del Flusso 2: tutto ciò che segue quel giorno trasla.
2. Se il nuovo orario entra in conflitto con gli orari di apertura reali del luogo (dato già noto da `opening_hours`, non serve nuova ricerca) o con un'altra tappa, Claude lo segnala nella preview invece di salvare silenziosamente un piano che non funziona.

## Cosa NON deve fare l'assistente

- Non modifica mai eventi di categoria `alloggio` (check-in/check-out) senza conferma esplicita separata, perché sono vincolati a prenotazioni reali fuori dall'app.
- Non inventa mai un prezzo, un orario o un indirizzo che non ha trovato: se `web_search` non restituisce informazioni affidabili, lo dice chiaramente nella preview invece di scrivere un dato plausibile ma non verificato.
- Non salva mai automaticamente: la preview è sempre un passaggio obbligato.

## Nota implementativa

Questo è il pezzo più delicato del progetto — prima di implementarlo, presentami un piano su: dove vive la logica di ricalcolo (Edge Function vs client), come si gestisce la latenza di `web_search` nella UI (stato di caricamento della preview), e come si evita che due utenti generino due preview in conflitto sullo stesso giorno contemporaneamente.
