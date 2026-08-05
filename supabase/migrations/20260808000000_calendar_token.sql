-- §13 calendar export feed: an unguessable per-trip token used as the feed
-- URL's access control (calendar apps subscribing to a feed don't send auth
-- headers, so the feed itself must be publicly reachable — see the
-- calendar-feed edge function, deployed with verify_jwt = false). No new RLS
-- policy needed for authenticated reads: the existing trips_select policy
-- already scopes this column to trip members like every other trip field.

alter table trips
  add column calendar_token uuid not null default gen_random_uuid() unique;
