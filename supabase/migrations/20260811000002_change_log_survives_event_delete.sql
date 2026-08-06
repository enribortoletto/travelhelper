-- Bug found during Step 9 live verification: itinerary_change_log.event_id
-- had "on delete cascade" — so deleting a stop wiped out not just the
-- delete's own log entry candidate but every *earlier* history row for
-- that same event too (its create, its edits, all cascaded away with it).
-- An audit trail that disappears exactly when the thing it was auditing
-- gets deleted defeats the point of keeping one. Confirmed live: after
-- confirming an AI "remove stop" preview for a stop that had earlier been
-- AI-created and AI-edited, only the delete's own log row survived — the
-- create/edit rows vanished along with the event.
--
-- Fix: on delete set null instead, so history rows persist (old_value still
-- has the full snapshot) with event_id nulled out once the event is gone —
-- the same shape the apply-on-confirm trigger already uses for a "delete"
-- entry's own log row.

alter table itinerary_change_log
  drop constraint itinerary_change_log_event_id_fkey;

alter table itinerary_change_log
  add constraint itinerary_change_log_event_id_fkey
  foreign key (event_id) references events (id) on delete set null;
