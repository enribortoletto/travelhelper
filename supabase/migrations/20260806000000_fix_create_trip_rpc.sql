-- Bug found via live end-to-end testing: `insert ... returning * into v_trip`
-- is gated by trips_select (RLS applies SELECT policies to RETURNING, not
-- just the INSERT policy's WITH CHECK) — and at that point in the function
-- no trip_members row exists yet, so is_trip_member() is false and the whole
-- call fails with "new row violates row-level security policy for table
-- trips", even though the INSERT itself was legitimate. This is exactly the
-- same chicken-and-egg bootstrap problem accept_trip_invite already solves
-- with SECURITY DEFINER — apply the same fix here.

create or replace function public.create_trip_with_owner(
  p_name text,
  p_start_date date,
  p_end_date date,
  p_timezone text,
  p_display_name text
)
returns trips
language plpgsql security definer set search_path = public as $$
declare
  v_trip trips;
begin
  insert into trips (name, start_date, end_date, timezone, created_by)
  values (p_name, p_start_date, p_end_date, p_timezone, auth.uid())
  returning * into v_trip;

  insert into trip_members (trip_id, user_id, role, is_owner, display_name)
  values (v_trip.id, auth.uid(), 'admin', true, p_display_name);

  insert into categories (trip_id, name, color, icon, is_system) values
    (v_trip.id, 'accommodation', '#ae2012', 'bed-double', true),
    (v_trip.id, 'transport', '#098083', 'car', true),
    (v_trip.id, 'activity', '#a26900', 'compass', false),
    (v_trip.id, 'meal', '#8c7123', 'coffee', false),
    (v_trip.id, 'note', '#001219', 'sticky-note', false);

  return v_trip;
end;
$$;
