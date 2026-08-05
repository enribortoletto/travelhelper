-- Found via live testing: trip_invites.created_by is not-null with no
-- default, so the ordinary client-side insert used by the invite flow
-- (§16 step 5 — no RPC wrapper, unlike trip creation) fails outright.
-- events.created_by has the same gap (nullable there, so it doesn't fail,
-- but every stop added through the CMS silently loses who added it).
-- Auto-filling from auth.uid() is exactly what these columns are for.

alter table trip_invites alter column created_by set default auth.uid();
alter table events alter column created_by set default auth.uid();
