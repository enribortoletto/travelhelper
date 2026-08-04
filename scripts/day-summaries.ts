// Riepiloghi testuali per giorno (posizione geografica, area/regione
// attraversata) — non presenti nell'Excel, generati una volta per
// popolare trip_days (01-data-model.md, 02-ux-flows.md). Condiviso tra
// seed-trip-days.ts (via API, richiede service role) e
// generate-sql-seed.ts (SQL statico da incollare nello SQL Editor).

export const TRIP_NAME = "Scozia 2026";

export const DAY_SUMMARIES: Record<string, string> = {
  "2026-08-10":
    "Arrivo serale a Edimburgo. Nessuna tappa turistica in programma: solo atterraggio e check-in tardo vicino all'aeroporto, in vista della partenza verso nord del giorno dopo.",
  "2026-08-11":
    "Da Edimburgo verso le Highlands centrali, passando per Stirling e il Cairngorms National Park. Prima notte a Inverness, la capitale delle Highlands scozzesi.",
  "2026-08-12":
    "Dalle Highlands alla costa nord-orientale del Caithness, fino a John o' Groats — il punto più a nord-est della Scozia continentale. Notte vicino Wick.",
  "2026-08-13":
    "Lungo la costa nord (North Coast 500) verso ovest, tra spiagge, riserve naturali e distillerie, fino a Ullapool. Da lì attraversamento verso l'Isola di Skye, con arrivo a tarda sera: prima di due notti sull'isola.",
  "2026-08-14":
    "Giornata intera sull'Isola di Skye, tra i paesaggi più spettacolari della Scozia: trekking, cascate, distillerie e tramonto sulla costa occidentale. Seconda notte a Skye.",
  "2026-08-15":
    "Da Skye verso Edimburgo attraverso le Highlands occidentali, con soste a Eilean Donan Castle e Glencoe. Rientro serale in città per l'ultima notte prima della partenza.",
  "2026-08-16": "Giorno di partenza: volo di rientro da Edimburgo.",
};
