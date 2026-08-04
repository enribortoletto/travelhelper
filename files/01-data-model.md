# Modello dati

## Tabella `events`

Un evento è una riga del foglio "Eventi" dell'Excel. Campi:

| Campo | Tipo | Note |
|---|---|---|
| id | uuid | PK |
| trip_id | uuid | FK, per supportare più viaggi in futuro |
| day | date | nullable finché l'evento non è programmato |
| category | enum | `alloggio`, `tappa`, `attivita`, `relax`, `trasporto`, `nota` |
| name | text | |
| status_plan | enum | `nel_piano`, `facoltativo` |
| start_time | time | nullable (alcuni eventi hanno solo un orario indicativo testuale, es. "check-in sera") |
| start_time_label | text | usato quando l'orario non è un time preciso (es. "da verificare", "check-in sera") |
| end_time | time | nullable |
| end_time_label | text | testo libero tipo "13:40 (partenza)" — vedi nota sotto |
| maps_place_id | text | place_id di Google, usato per pin e Directions API |
| maps_link | text | link generato da maps_place_id |
| website | text | nullable |
| price | text | testo libero (i prezzi reali variano/non sono tutti noti) |
| opening_hours | jsonb | orari per giorno della settimana, quando disponibili da Google Places |
| description | text | |
| contact | text | telefono |
| weather_dependent | boolean | |
| priority | enum | `alta`, `media`, `bassa`, nullable — solo per facoltativi |
| created_by | uuid | FK a users, per il multi-utente |
| updated_at | timestamptz | |

**Nota importante sugli orari**: nel foglio Excel gli orari di fine sono spesso testo libero tipo `"12:30 (partenza)"` invece di un time puro, perché includono note. In app, separa sempre un `end_time` (time puro, usato per i calcoli) da eventuali note descrittive, che vanno in un campo note separato — non incollare tutto insieme come nell'Excel. Stessa cosa per gli orari "check-in sera" o "da verificare": sono placeholder testuali finché non c'è un orario reale, l'app deve gestirli come stato "da definire", non come stringhe da parsare.

## Tabella `trip_days`

Vista derivata o tabella materializzata per giorno: `day`, `overnight_stay_event_id` (FK all'evento Alloggio di quella notte), `summary` (testo generato, vedi `02-ux-flows.md` sezione Viaggio).

## Tabella `users` / `trip_members`

Multi-utente: ogni utente del gruppo ha accesso in lettura/scrittura a tutti gli eventi del trip (nessun ruolo differenziato per ora — tutti possono modificare). Usa Supabase Auth + RLS basata su `trip_members`.

## Tabella `itinerary_change_log`

Ogni modifica (aggiunta, rimozione, spostamento orario, ritardo segnalato) va loggata qui con: `event_id`, `change_type`, `old_value`, `new_value`, `triggered_by_user`, `ai_preview_id` (se generata da un preview AI, vedi `04-ai-assistant.md`), `created_at`. Serve sia per undo sia per mostrare uno storico nella sezione Calendario.

## Import iniziale

Importa `Viaggio_Scozia_Eventi.xlsx`, foglio "Eventi", righe con `Nel piano / Facoltativo` non vuoto. Mappa:
- colonna "Giorno (data)" → `day`
- "Categoria" → `category` (converti "Attivita"→`attivita`, ecc.)
- "Nel piano / Facoltativo" → `status_plan`
- "Ora inizio consigliata" → separa in `start_time` + eventuale nota
- "Ora fine / Durata stimata" → separa in `end_time` + eventuale nota
- "Link Google Maps (pin)" → estrai il `place_id` dalla query string per popolare `maps_place_id`
- resto delle colonne 1:1

Ignora le righe di esempio o senza `Nome evento`.
