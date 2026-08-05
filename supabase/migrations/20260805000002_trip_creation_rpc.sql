-- §16: creating a trip must be possible entirely in-app. This RPC does the
-- atomic bootstrap (trip + first member as admin/owner + system + starter
-- categories) as a single call, respecting RLS as the calling user (no
-- SECURITY DEFINER — every individual insert below is already permitted by
-- the policies from the previous migration for exactly this sequence).

create or replace function public.create_trip_with_owner(
  p_name text,
  p_start_date date,
  p_end_date date,
  p_timezone text,
  p_display_name text
)
returns trips
language plpgsql as $$
declare
  v_trip trips;
begin
  insert into trips (name, start_date, end_date, timezone, created_by)
  values (p_name, p_start_date, p_end_date, p_timezone, auth.uid())
  returning * into v_trip;

  insert into trip_members (trip_id, user_id, role, is_owner, display_name)
  values (v_trip.id, auth.uid(), 'admin', true, p_display_name);

  -- Two reserved categories (§10) plus a small renameable/deletable starter
  -- set (§16) — the creator can delete/replace the starters freely, the
  -- system ones are protected by the trigger from the schema migration.
  insert into categories (trip_id, name, color, icon, is_system) values
    (v_trip.id, 'accommodation', '#ae2012', 'bed-double', true),
    (v_trip.id, 'transport', '#098083', 'car', true),
    (v_trip.id, 'activity', '#a26900', 'compass', false),
    (v_trip.id, 'meal', '#8c7123', 'coffee', false),
    (v_trip.id, 'note', '#001219', 'sticky-note', false);

  return v_trip;
end;
$$;
