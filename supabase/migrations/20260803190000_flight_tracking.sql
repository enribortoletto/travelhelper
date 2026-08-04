-- Tracciamento voli in tempo reale (integrazione AeroDataBox via RapidAPI,
-- vedi supabase/functions/flight-status): collega un evento al numero di
-- volo IATA/ICAO e alla tratta (partenza o arrivo) che rappresenta per noi,
-- così la edge function sa quale numero cercare su AeroDataBox e quale lato
-- del volo (departure/arrival) usare per calcolare il ritardo rispetto
-- all'orario schedulato.
--
-- Il ritardo/stato live viene scritto sulle colonne già esistenti
-- (delay_minutes, start_time_label) — stesse colonne già mostrate ovunque
-- nell'app per "In ritardo" — nessuna nuova colonna o componente UI serve
-- per mostrarlo.

create type flight_leg as enum ('departure', 'arrival');

alter table events
  add column flight_number text,
  add column flight_leg flight_leg;
