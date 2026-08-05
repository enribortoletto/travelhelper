-- Row-level security for every table in the previous migration, per §15:
-- read = any trip member; write = admin/editor; membership/role = admin;
-- trip deletion + ownership transfer = owner specifically; derived events
-- (is_derived = true) are never writable by a client, only by service_role
-- (which bypasses RLS entirely — nothing to add for it here).

alter table trips enable row level security;
alter table trip_members enable row level security;
alter table trip_invites enable row level security;
alter table categories enable row level security;
alter table events enable row level security;
alter table travel_mode_overrides enable row level security;
alter table event_travel_baseline enable row level security;
alter table user_settings enable row level security;
alter table notification_log enable row level security;
alter table itinerary_change_log enable row level security;
alter table ai_previews enable row level security;

-- ============================================================
-- trips
-- ============================================================

create policy trips_select on trips
  for select using (public.is_trip_member(id, auth.uid()));

create policy trips_insert on trips
  for insert with check (created_by = auth.uid());

create policy trips_update on trips
  for update using (public.get_trip_role(id, auth.uid()) in ('admin', 'editor'));

create policy trips_delete_owner_only on trips
  for delete using (public.is_trip_owner(id, auth.uid()));

-- ============================================================
-- trip_members
-- ============================================================

create policy trip_members_select on trip_members
  for select using (public.is_trip_member(trip_id, auth.uid()));

-- Admins can add anyone; a user can also insert themselves as the very
-- first member of a trip they just created (the CMS bootstrap step, §16) —
-- there's no membership row yet at that point to check against.
create policy trip_members_insert on trip_members
  for insert with check (
    public.get_trip_role(trip_id, auth.uid()) = 'admin'
    or (
      user_id = auth.uid()
      and exists (select 1 from trips where id = trip_id and created_by = auth.uid())
      and not public.is_trip_member(trip_id, auth.uid())
    )
  );

create policy trip_members_update on trip_members
  for update using (public.get_trip_role(trip_id, auth.uid()) = 'admin');

-- A member can remove themselves (leave); otherwise admin-only. The
-- owner/last-admin invariants are enforced by the trigger in the schema
-- migration regardless of which of these two paths fires.
create policy trip_members_delete on trip_members
  for delete using (
    user_id = auth.uid()
    or public.get_trip_role(trip_id, auth.uid()) = 'admin'
  );

-- §15: only the current owner may transfer ownership (change is_owner) —
-- layered on top of the admin-level UPDATE policy above, which alone would
-- let any admin flip is_owner on anyone.
create or replace function public.trip_members_ownership_transfer_owner_only()
returns trigger language plpgsql as $$
begin
  if new.is_owner is distinct from old.is_owner
     and not public.is_trip_owner(old.trip_id, auth.uid()) then
    raise exception 'only the current owner can transfer ownership';
  end if;
  return new;
end;
$$;

create trigger trip_members_ownership_transfer_owner_only
  before update on trip_members
  for each row execute function trip_members_ownership_transfer_owner_only();

-- ============================================================
-- trip_invites — admin only, in every direction
-- ============================================================

create policy trip_invites_select on trip_invites
  for select using (public.get_trip_role(trip_id, auth.uid()) = 'admin');

create policy trip_invites_insert on trip_invites
  for insert with check (public.get_trip_role(trip_id, auth.uid()) = 'admin');

create policy trip_invites_delete on trip_invites
  for delete using (public.get_trip_role(trip_id, auth.uid()) = 'admin');

-- Redeeming an invite (by token) happens through this SECURITY DEFINER
-- function rather than a raw client INSERT on trip_members, since the
-- client shouldn't need row-level access to someone else's invite record
-- just to accept it.
create or replace function public.accept_trip_invite(p_token uuid)
returns trip_members
language plpgsql security definer set search_path = public as $$
declare
  v_invite trip_invites;
  v_member trip_members;
begin
  select * into v_invite from trip_invites
    where token = p_token and (expires_at is null or expires_at > now());

  if v_invite is null then
    raise exception 'invite not found or expired';
  end if;

  if v_invite.invited_email is not null
     and v_invite.invited_email <> (select email from auth.users where id = auth.uid()) then
    raise exception 'this invite was sent to a different email address';
  end if;

  insert into trip_members (trip_id, user_id, role, display_name)
  values (
    v_invite.trip_id, auth.uid(), v_invite.role,
    coalesce((select raw_user_meta_data ->> 'display_name' from auth.users where id = auth.uid()), 'New member')
  )
  on conflict (trip_id, user_id) do update set role = excluded.role
  returning * into v_member;

  return v_member;
end;
$$;

-- ============================================================
-- categories
-- ============================================================

create policy categories_select on categories
  for select using (public.is_trip_member(trip_id, auth.uid()));

create policy categories_insert on categories
  for insert with check (public.get_trip_role(trip_id, auth.uid()) in ('admin', 'editor'));

create policy categories_update on categories
  for update using (public.get_trip_role(trip_id, auth.uid()) in ('admin', 'editor'));

create policy categories_delete on categories
  for delete using (public.get_trip_role(trip_id, auth.uid()) in ('admin', 'editor'));

-- ============================================================
-- events — admin/editor, and never on derived rows (§7)
-- ============================================================

create policy events_select on events
  for select using (public.is_trip_member(trip_id, auth.uid()));

create policy events_insert on events
  for insert with check (
    public.get_trip_role(trip_id, auth.uid()) in ('admin', 'editor')
    and is_derived = false
  );

create policy events_update on events
  for update
  using (
    public.get_trip_role(trip_id, auth.uid()) in ('admin', 'editor')
    and is_derived = false
  )
  with check (is_derived = false);

create policy events_delete on events
  for delete using (
    public.get_trip_role(trip_id, auth.uid()) in ('admin', 'editor')
    and is_derived = false
  );

-- ============================================================
-- travel_mode_overrides
-- ============================================================

create policy travel_mode_overrides_select on travel_mode_overrides
  for select using (public.is_trip_member(trip_id, auth.uid()));

create policy travel_mode_overrides_write on travel_mode_overrides
  for all
  using (public.get_trip_role(trip_id, auth.uid()) in ('admin', 'editor'))
  with check (public.get_trip_role(trip_id, auth.uid()) in ('admin', 'editor'));

-- ============================================================
-- event_travel_baseline — read-only for clients, written only by the
-- notifications job (service_role bypasses RLS, no client policy needed)
-- ============================================================

create policy event_travel_baseline_select on event_travel_baseline
  for select using (public.is_trip_member(trip_id, auth.uid()));

-- ============================================================
-- user_settings — each user manages only their own row
-- ============================================================

create policy user_settings_select on user_settings
  for select using (user_id = auth.uid());

create policy user_settings_upsert on user_settings
  for insert with check (user_id = auth.uid() and public.is_trip_member(trip_id, auth.uid()));

create policy user_settings_update on user_settings
  for update using (user_id = auth.uid());

-- ============================================================
-- notification_log — read own; "mark as read" is the only client write
-- ============================================================

create policy notification_log_select on notification_log
  for select using (user_id = auth.uid());

create policy notification_log_mark_read on notification_log
  for update using (user_id = auth.uid());

-- ============================================================
-- itinerary_change_log — read-only history for members, written by
-- triggers/server logic in a later build step, not directly by clients
-- ============================================================

create policy itinerary_change_log_select on itinerary_change_log
  for select using (public.is_trip_member(trip_id, auth.uid()));

-- ============================================================
-- ai_previews — members read; only the confirm/discard status transition
-- is a direct client write, the preview itself is written by the AI
-- assistant Edge Function (service_role)
-- ============================================================

create policy ai_previews_select on ai_previews
  for select using (public.is_trip_member(trip_id, auth.uid()));

create policy ai_previews_update_status on ai_previews
  for update using (public.get_trip_role(trip_id, auth.uid()) in ('admin', 'editor'));
