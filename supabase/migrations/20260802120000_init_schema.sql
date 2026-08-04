-- Scozia 2026 — schema iniziale
-- Tabelle, enum, RLS e trigger per il diario di viaggio.

create extension if not exists pgcrypto;

-- ============================================================
-- ENUM
-- ============================================================

create type event_category as enum (
  'alloggio',
  'tappa',
  'attivita',
  'relax',
  'trasporto',
  'nota'
);

create type status_plan as enum ('nel_piano', 'facoltativo');

create type event_priority as enum ('alta', 'media', 'bassa');

create type change_type as enum (
  'aggiunta',
  'rimozione',
  'spostamento_orario',
  'ritardo',
  'altro'
);

create type ai_preview_status as enum ('pending', 'confirmed', 'cancelled', 'expired');

-- ============================================================
-- TABELLE
-- ============================================================

create table trips (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now()
);

create table trip_members (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null,
  joined_at timestamptz not null default now(),
  unique (trip_id, user_id)
);

-- Allow-list di email invitate: un utente entra in trip_members solo se la
-- sua email risulta qui al primo login (vedi trigger handle_new_user sotto).
create table trip_invites (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips (id) on delete cascade,
  email text not null,
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (trip_id, email)
);

create table events (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips (id) on delete cascade,
  day date,
  category event_category not null,
  name text not null,
  status_plan status_plan not null,
  start_time time,
  start_time_label text,
  end_time time,
  end_time_label text,
  maps_place_id text,
  maps_link text,
  website text,
  price text,
  opening_hours jsonb,
  description text,
  contact text,
  weather_dependent boolean not null default false,
  priority event_priority,
  -- stato runtime (non nel data-model originale, richiesto da 02-ux-flows.md
  -- per "Segna come in ritardo" / "Saltato/Annullato")
  is_skipped boolean not null default false,
  delay_minutes integer not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index events_trip_day_idx on events (trip_id, day);
create index events_maps_place_id_idx on events (maps_place_id);

create table trip_days (
  trip_id uuid not null references trips (id) on delete cascade,
  day date not null,
  overnight_stay_event_id uuid references events (id) on delete set null,
  summary text,
  primary key (trip_id, day)
);

create table itinerary_change_log (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips (id) on delete cascade,
  event_id uuid references events (id) on delete set null,
  change_type change_type not null,
  old_value jsonb,
  new_value jsonb,
  triggered_by_user uuid references auth.users (id) on delete set null,
  ai_preview_id uuid,
  created_at timestamptz not null default now()
);

create table ai_previews (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips (id) on delete cascade,
  day date,
  status ai_preview_status not null default 'pending',
  proposed_changes jsonb not null,
  summary text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 minutes')
);

alter table itinerary_change_log
  add constraint itinerary_change_log_ai_preview_id_fkey
  foreign key (ai_preview_id) references ai_previews (id) on delete set null;

create table user_settings (
  user_id uuid not null references auth.users (id) on delete cascade,
  trip_id uuid not null references trips (id) on delete cascade,
  daily_recap_time time not null default '08:00',
  quiet_hours_start time not null default '22:00',
  quiet_hours_end time not null default '08:00',
  push_subscription jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, trip_id)
);

-- event_id è nullable perché il recap giornaliero non è legato a un singolo
-- evento ma a un utente+giorno; due indici univoci parziali coprono la
-- deduplica in entrambi i casi (per evento, o per giorno quando event_id è nullo).
create table notification_log (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips (id) on delete cascade,
  event_id uuid references events (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  day date,
  notification_type text not null,
  sent_at timestamptz not null default now()
);

create unique index notification_log_event_dedup
  on notification_log (event_id, user_id, notification_type)
  where event_id is not null;

create unique index notification_log_day_dedup
  on notification_log (trip_id, user_id, notification_type, day)
  where event_id is null;

-- ============================================================
-- HELPER: appartenenza al trip (security definer per evitare
-- ricorsione nelle policy RLS su trip_members)
-- ============================================================

create or replace function is_trip_member(_trip_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from trip_members
    where trip_id = _trip_id and user_id = auth.uid()
  );
$$;

-- ============================================================
-- RLS
-- ============================================================

alter table trips enable row level security;
alter table trip_members enable row level security;
alter table trip_invites enable row level security;
alter table events enable row level security;
alter table trip_days enable row level security;
alter table itinerary_change_log enable row level security;
alter table ai_previews enable row level security;
alter table user_settings enable row level security;
alter table notification_log enable row level security;

-- trips: lettura per i membri, nessuna scrittura da client
create policy trips_select on trips
  for select using (is_trip_member(id));

-- trip_members: i membri vedono i compagni di viaggio; join gestito dal trigger
create policy trip_members_select on trip_members
  for select using (is_trip_member(trip_id));

-- trip_invites: nessun accesso client (gestito da service role)

-- events: CRUD completo per i membri del trip (nessun ruolo differenziato)
create policy events_select on events
  for select using (is_trip_member(trip_id));
create policy events_insert on events
  for insert with check (is_trip_member(trip_id));
create policy events_update on events
  for update using (is_trip_member(trip_id)) with check (is_trip_member(trip_id));
create policy events_delete on events
  for delete using (is_trip_member(trip_id));

-- trip_days: lettura per i membri; scrittura riservata a service role (edge function)
create policy trip_days_select on trip_days
  for select using (is_trip_member(trip_id));

-- itinerary_change_log: append-only, lettura per i membri
create policy change_log_select on itinerary_change_log
  for select using (is_trip_member(trip_id));
create policy change_log_insert on itinerary_change_log
  for insert with check (is_trip_member(trip_id) and triggered_by_user = auth.uid());

-- ai_previews: i membri creano/leggono/aggiornano (conferma o annulla) le preview del trip
create policy ai_previews_select on ai_previews
  for select using (is_trip_member(trip_id));
create policy ai_previews_insert on ai_previews
  for insert with check (is_trip_member(trip_id) and created_by = auth.uid());
create policy ai_previews_update on ai_previews
  for update using (is_trip_member(trip_id)) with check (is_trip_member(trip_id));

-- user_settings: solo le proprie
create policy user_settings_select on user_settings
  for select using (user_id = auth.uid());
create policy user_settings_upsert on user_settings
  for insert with check (user_id = auth.uid());
create policy user_settings_update on user_settings
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- notification_log: nessun accesso client (solo service role da edge function)

-- ============================================================
-- TRIGGER: updated_at automatico su events
-- ============================================================

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger events_set_updated_at
  before update on events
  for each row
  execute function set_updated_at();

-- ============================================================
-- TRIGGER: auto-join a trip_members al primo login, se l'email
-- risulta invitata in trip_invites
-- ============================================================

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into trip_members (trip_id, user_id, display_name)
  select ti.trip_id, new.id, split_part(new.email, '@', 1)
  from trip_invites ti
  where lower(ti.email) = lower(new.email)
  on conflict (trip_id, user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function handle_new_user();

-- ============================================================
-- REALTIME: sincronizzazione multi-utente (02-ux-flows.md)
-- ============================================================

alter publication supabase_realtime add table events;
alter publication supabase_realtime add table trip_days;
alter publication supabase_realtime add table itinerary_change_log;
alter publication supabase_realtime add table ai_previews;
