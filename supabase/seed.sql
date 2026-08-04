-- Seed manuale: crea il trip (se non esiste ancora — lo stesso lookup-or-create
-- lo fa scripts/import-events.ts) e le email autorizzate ad accedere.
--
-- Sostituisci le email placeholder con quelle reali del gruppo prima di eseguire
-- questo file (SQL editor di Supabase, oppure `psql` collegato al progetto).

insert into trips (name, start_date, end_date)
select 'Scozia 2026', '2026-08-10', '2026-08-16'
where not exists (select 1 from trips where name = 'Scozia 2026');

insert into trip_invites (trip_id, email)
select t.id, e.email
from trips t
cross join (
  values
    ('enricobortoletto@gmail.com')
) as e (email)
where t.name = 'Scozia 2026'
on conflict (trip_id, email) do nothing;
