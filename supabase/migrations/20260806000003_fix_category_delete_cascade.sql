-- Same bug class as the previous migration: categories_protect_system_rows
-- also fires during a trip's own cascade delete and blocks it, since the
-- reserved accommodation/transport categories can never be directly
-- deleted — but a whole-trip deletion legitimately removes them along with
-- everything else. Skip the protection once the parent trip is already gone.

create or replace function public.categories_protect_system_rows()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from trips where id = old.trip_id) then
    return old;
  end if;

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
