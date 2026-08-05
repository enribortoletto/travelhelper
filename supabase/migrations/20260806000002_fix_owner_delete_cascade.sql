-- Bug found via live testing: deleting a trip (owner-only, §15) cascades to
-- trip_members, which fires trip_members_protect_owner_and_last_admin as a
-- BEFORE DELETE trigger per cascaded row — and that trigger unconditionally
-- blocks removing the owner's membership row. Net effect: an owner could
-- never actually delete their own trip, the opposite of what §15 grants.
-- Standard fix: let the trigger detect "the trip itself is being deleted"
-- (the parent row is already gone by the time the cascade reaches this
-- child row) and skip the invariant checks in that case — they only protect
-- a trip that continues to exist with a dangling ownership/admin gap.

create or replace function public.trip_members_protect_owner_and_last_admin()
returns trigger language plpgsql as $$
declare
  remaining_admins int;
begin
  if tg_op = 'DELETE' and not exists (select 1 from trips where id = old.trip_id) then
    return old;
  end if;

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
