-- Step 5 (§6/§7/§8): routing/travel-time support.
--
-- - trips.default_day_start: §7's fallback origin-departure time when a leg's
--   origin has no known end_time/start_time and there's no departure event
--   (e.g. the very first leg of the trip, before any accommodation exists).
-- - travel_time_cache: §6's shared cache keyed by (origin, destination, mode)
--   so the same leg is never estimated twice. Readable by any authenticated
--   user (place-pair durations aren't trip-scoped or sensitive); writes only
--   via the maps-directions edge function's service_role client, so no write
--   policy is defined here.

alter table trips
  add column default_day_start time not null default '09:00:00';

create table travel_time_cache (
  origin_place_id text not null,
  destination_place_id text not null,
  mode travel_mode not null,
  duration_seconds int not null,
  distance_meters int not null,
  fetched_at timestamptz not null default now(),
  primary key (origin_place_id, destination_place_id, mode)
);

alter table travel_time_cache enable row level security;

create policy travel_time_cache_select on travel_time_cache
  for select using (auth.role() = 'authenticated');
