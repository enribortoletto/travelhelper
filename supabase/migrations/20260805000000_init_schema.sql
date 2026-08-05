-- Initial schema: every table from 02-technical-specification.md §A3,
-- plus RLS enforcing 01-core-logic-and-algorithms.md §15 (roles + owner).
--
-- Design notes:
-- - `auth.users` (Supabase built-in) is the identity table; every user_id
--   below references it.
-- - Deleting a trip cascades to everything scoped by trip_id — matches the
--   owner-only "delete the entire trip" capability in §15.
-- - RLS on `trip_members` cannot subquery `trip_members` directly inside its
--   own policy (infinite recursion) — two SECURITY DEFINER helper functions
--   below break that cycle, and every other table's policies reuse them.

-- ============================================================
-- Enums
-- ============================================================

create type trip_role as enum ('admin', 'editor', 'viewer');
create type planning_status as enum ('planned', 'optional');
create type event_status as enum ('inactive', 'in_progress', 'skipped');
create type event_priority as enum ('high', 'medium', 'low');
create type derived_kind as enum ('transit', 'checkin', 'checkout');
create type flight_leg as enum ('departure', 'arrival');
create type travel_mode as enum ('driving', 'walking', 'transit');
create type ai_preview_status as enum ('pending', 'confirmed', 'discarded');

-- ============================================================
-- trips
-- ============================================================

create table trips (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_date date not null,
  end_date date not null,
  timezone text not null, -- IANA name, e.g. "Europe/London" (§1)
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  constraint trips_dates_valid check (end_date >= start_date)
);

-- ============================================================
-- trip_members (+ owner/admin invariants)
-- ============================================================

create table trip_members (
  trip_id uuid not null references trips (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role trip_role not null default 'editor',
  is_owner boolean not null default false,
  display_name text not null,
  joined_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);

-- At most one owner per trip at the constraint level; "at least one" and
-- "owner must be an admin" are enforced by the trigger below (§15).
create unique index trip_members_one_owner on trip_members (trip_id) where is_owner;

create or replace function public.get_trip_role(p_trip_id uuid, p_user_id uuid)
returns trip_role
language sql stable security definer set search_path = public as $$
  select role from trip_members where trip_id = p_trip_id and user_id = p_user_id;
$$;

create or replace function public.is_trip_member(p_trip_id uuid, p_user_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from trip_members where trip_id = p_trip_id and user_id = p_user_id);
$$;

create or replace function public.is_trip_owner(p_trip_id uuid, p_user_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_owner from trip_members where trip_id = p_trip_id and user_id = p_user_id), false);
$$;

-- §15: owner is a flag on top of admin, never on editor/viewer.
create or replace function public.trip_members_owner_must_be_admin()
returns trigger language plpgsql as $$
begin
  if new.is_owner and new.role <> 'admin' then
    raise exception 'the trip owner must have role admin';
  end if;
  return new;
end;
$$;

create trigger trip_members_owner_must_be_admin
  before insert or update on trip_members
  for each row execute function trip_members_owner_must_be_admin();

-- §15: block removing/demoting the last admin, and separately block
-- removing/demoting the owner unless ownership was transferred first —
-- the owner rule is strictly stronger, it fires even when other admins exist.
create or replace function public.trip_members_protect_owner_and_last_admin()
returns trigger language plpgsql as $$
declare
  remaining_admins int;
begin
  if old.is_owner and (tg_op = 'DELETE' or (new.is_owner is false or new.role <> 'admin')) then
    raise exception 'transfer ownership to another admin before removing, demoting, or leaving as owner';
  end if;

  if old.role = 'admin' then
    select count(*) into remaining_admins
    from trip_members
    where trip_id = old.trip_id and role = 'admin' and user_id <> old.user_id;

    if remaining_admins = 0 and (tg_op = 'DELETE' or new.role <> 'admin') then
      raise exception 'a trip must always retain at least one admin';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger trip_members_protect_owner_and_last_admin
  before update or delete on trip_members
  for each row execute function trip_members_protect_owner_and_last_admin();

-- ============================================================
-- trip_invites
-- ============================================================

create table trip_invites (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips (id) on delete cascade,
  role trip_role not null default 'editor',
  token uuid not null default gen_random_uuid() unique,
  invited_email text, -- null = shareable link, set = a specific email invite
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

-- ============================================================
-- categories
-- ============================================================

create table categories (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips (id) on delete cascade,
  name text not null, -- free text (§10); "accommodation"/"transport" are the two reserved values
  color text not null,
  icon text not null default 'map-pin',
  is_system boolean not null default false,
  unique (trip_id, name)
);

create or replace function public.categories_protect_system_rows()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and old.is_system then
    raise exception 'reserved categories (accommodation, transport) cannot be deleted';
  end if;
  if tg_op = 'UPDATE' and old.is_system and new.name <> old.name then
    raise exception 'reserved categories (accommodation, transport) cannot be renamed';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger categories_protect_system_rows
  before update or delete on categories
  for each row execute function categories_protect_system_rows();

-- ============================================================
-- events — every stop, transit leg, and check-in/check-out companion (§7)
-- ============================================================

create table events (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips (id) on delete cascade,
  category_id uuid not null references categories (id),
  day date,
  name text not null,
  planning_status planning_status, -- null for derived events (§3)
  is_skipped boolean not null default false,
  status_runtime event_status not null default 'inactive',
  start_time time,
  end_time time,
  start_time_label text,
  end_time_label text,
  visit_duration_minutes int,
  maps_place_id text,
  maps_link text,
  website text,
  price text,
  description text,
  contact text,
  opening_hours jsonb, -- per-weekday {open, close} (§8)
  kitchen_closing_time time, -- food-service only (§8)
  check_in_window_start time, -- accommodation only (§7)
  check_in_window_end time,
  checkout_deadline time, -- accommodation only, single cutoff not a window (§7)
  weather_dependent boolean not null default false,
  priority event_priority, -- optional stops only
  is_derived boolean not null default false,
  derived_kind derived_kind,
  transit_from_event_id uuid references events (id) on delete cascade,
  transit_to_event_id uuid references events (id) on delete cascade,
  checkin_for_event_id uuid references events (id) on delete cascade,
  checkout_for_event_id uuid references events (id) on delete cascade,
  flight_number text,
  flight_leg flight_leg,
  delay_minutes int not null default 0,
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now(),

  constraint events_derived_has_kind check (is_derived = false or derived_kind is not null),
  constraint events_visit_duration_positive check (visit_duration_minutes is null or visit_duration_minutes > 0)
);

create index events_trip_day_idx on events (trip_id, day);
create index events_trip_status_idx on events (trip_id, status_runtime);

-- §3: accommodation is always planned, never optional. Implemented as a
-- trigger (not a plain CHECK) because it depends on the category row.
create or replace function public.events_accommodation_always_planned()
returns trigger language plpgsql as $$
declare
  cat_name text;
begin
  select name into cat_name from categories where id = new.category_id;
  if cat_name = 'accommodation' and new.planning_status = 'optional' then
    raise exception 'accommodation stops must always be planned, never optional';
  end if;
  return new;
end;
$$;

create trigger events_accommodation_always_planned
  before insert or update on events
  for each row execute function events_accommodation_always_planned();

-- ============================================================
-- travel_mode_overrides (§6)
-- ============================================================

create table travel_mode_overrides (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips (id) on delete cascade,
  place_id_a text not null,
  place_id_b text not null,
  mode travel_mode not null,
  note text
);

-- ============================================================
-- event_travel_baseline (§11 rule 5, §17's adaptive lookahead)
-- ============================================================

create table event_travel_baseline (
  trip_id uuid not null references trips (id) on delete cascade,
  from_event_id uuid not null references events (id) on delete cascade,
  to_event_id uuid not null references events (id) on delete cascade,
  baseline_minutes int not null,
  checked_at timestamptz not null default now(),
  primary key (from_event_id, to_event_id)
);

-- ============================================================
-- user_settings (§11)
-- ============================================================

create table user_settings (
  user_id uuid not null references auth.users (id) on delete cascade,
  trip_id uuid not null references trips (id) on delete cascade,
  daily_recap_time time not null default '07:30',
  quiet_hours_start time not null default '22:00',
  quiet_hours_end time not null default '08:00',
  push_subscription jsonb,
  notification_prefs jsonb not null default '{
    "recap": true, "reminder_before_start": true,
    "short_delay": true, "long_delay": true, "travel_time_variation": true
  }'::jsonb,
  primary key (user_id, trip_id)
);

-- ============================================================
-- notification_log — dedup claim + in-app history entry (§11)
-- ============================================================

create table notification_log (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  notification_type text not null,
  event_id uuid references events (id) on delete cascade,
  day date,
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (trip_id, user_id, notification_type, event_id, day)
);

create index notification_log_unread_idx on notification_log (user_id, trip_id) where read_at is null;

-- ============================================================
-- itinerary_change_log
-- ============================================================

create table itinerary_change_log (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips (id) on delete cascade,
  event_id uuid references events (id) on delete cascade,
  change_type text not null,
  old_value jsonb,
  new_value jsonb,
  triggered_by_user uuid references auth.users (id),
  ai_preview_id uuid,
  created_at timestamptz not null default now()
);

-- ============================================================
-- ai_previews (§14's preview-then-confirm staging row)
-- ============================================================

create table ai_previews (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips (id) on delete cascade,
  day date,
  proposed_changes jsonb not null,
  created_by uuid not null references auth.users (id),
  status ai_preview_status not null default 'pending',
  created_at timestamptz not null default now()
);

alter table itinerary_change_log
  add constraint itinerary_change_log_ai_preview_fk
  foreign key (ai_preview_id) references ai_previews (id) on delete set null;
