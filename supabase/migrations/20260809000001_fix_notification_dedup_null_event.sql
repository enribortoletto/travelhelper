-- Bug found during Step 7 live verification: the original
-- unique(trip_id, user_id, notification_type, event_id, day) constraint
-- never dedupes rows where event_id is null (the daily recap's dedup key,
-- §11 rule 1) — SQL treats NULL <> NULL, so two "recap" rows for the same
-- user/trip/day both satisfy the constraint and the claim pattern silently
-- stops working for any notification_type that has no associated event.
-- Confirmed live: the recap notification fired twice, 19 seconds apart,
-- across two notification-rules runs.
--
-- Fix: replace it with a unique index over event_id coalesced to a fixed
-- nil UUID, so two null-event_id rows for the same key now collide as
-- intended, while keeping every other combination unique exactly as before.

alter table notification_log
  drop constraint notification_log_trip_id_user_id_notification_type_event_id_key;

create unique index notification_log_dedup_idx on notification_log (
  trip_id,
  user_id,
  notification_type,
  day,
  coalesce(event_id, '00000000-0000-0000-0000-000000000000'::uuid)
);
