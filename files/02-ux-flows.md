# UX / Flussi

L'app ha 3 sezioni, navigabili da una tab bar in basso.

## 1. Oggi

- La mappa di Google occupa tutta la viewport.
- Un pannello inferiore (bottom sheet) è sovrapposto: parte **parzialmente aperto**, mostrando solo la striscia con il prossimo evento della giornata (non completamente chiuso, non a tutto schermo). Con swipe verticale verso l'alto si espande fino a coprire tutta la viewport, mostrando la lista completa degli eventi del giorno in stile agenda/calendario.
- Con swipe orizzontale sul pannello (in qualunque stato di apertura) si passa al giorno precedente/successivo del viaggio.
- Ogni evento nel pannello mostra: icona e colore di categoria, nome, orario, stato (vedi sotto), e per gli eventi "attivita"/"relax" un mini-riepilogo (prezzo, orari apertura se rilevante).
- Tap su un evento apre il dettaglio completo (tutti i campi del modello dati) con pulsanti: "Apri in Google Maps" (deep link per navigazione), "Modifica", "Elimina", "Segna come in ritardo".
- Ogni evento ha uno stato visivo: **Non attivo** (l'ora corrente non corrisponde), **In corso** (l'ora corrente rientra nell'intervallo), **Saltato/Annullato** (marcato manualmente).

## 2. Viaggio

- Mappa d'insieme con tutti i pin del viaggio, colorati per categoria.
- Sotto la mappa, riepilogo per ogni giorno: dove si dorme quella notte, 2-3 righe di descrizione generale (posizione geografica, area storica/regione attraversata — genera questo testo, non è nell'Excel), lista sintetica delle tappe principali.
- Tap su un giorno scrolla/centra la mappa sulle tappe di quel giorno.

## 3. Calendario

- Vista calendario completa, editabile: aggiungere, modificare, cancellare eventi.
- Ogni modifica qui passa dagli stessi flussi descritti in `04-ai-assistant.md` (preview prima di salvare, ricalcolo tempistiche).
- Filtro per mostrare/nascondere le tappe facoltative.

## Stati e colori categoria

Ogni categoria (`alloggio`, `tappa`, `attivita`, `relax`, `trasporto`, `nota`) ha un colore e un'icona distinti, coerenti in tutte e 3 le sezioni. Proponi tu una palette accessibile (contrasto sufficiente su mappa e su sfondo chiaro/scuro).

## Multi-utente

Tutti i membri del gruppo vedono le stesse modifiche in tempo reale (Supabase Realtime). Non serve un indicatore di "chi sta modificando cosa" per la v1, ma evita che due modifiche concorrenti sullo stesso evento si sovrascrivano silenziosamente — un semplice "ultimo salvataggio vince" con toast di notifica ("Aggiornato da [nome]") è sufficiente.
