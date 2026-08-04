-- Stima "originale" del tempo di guida tra due tappe consecutive, usata
-- per rilevare variazioni significative di traffico (05-notification-rules.md,
-- regola 5). Calcolata la prima volta che il job di notifiche controlla una
-- tratta; i confronti successivi la usano come riferimento.

create table event_travel_baseline (
  trip_id uuid not null references trips (id) on delete cascade,
  from_event_id uuid not null references events (id) on delete cascade,
  to_event_id uuid not null references events (id) on delete cascade,
  baseline_minutes integer not null,
  computed_at timestamptz not null default now(),
  primary key (from_event_id, to_event_id)
);

alter table event_travel_baseline enable row level security;
-- Nessun accesso client: letta/scritta solo dall'edge function delle notifiche (service role).
