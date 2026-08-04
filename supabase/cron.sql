-- Programma l'invio periodico delle notifiche push (ogni 5 minuti) usando
-- pg_cron + pg_net, direttamente via SQL — alternativa alla UI "Cron Jobs"
-- della dashboard quando non è facile da trovare/usare.
--
-- Sostituisci <ANON_KEY> con la tua VITE_SUPABASE_ANON_KEY (quella già in
-- app/.env — è pensata per essere pubblica, va bene usarla qui).

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'send-notifications-every-5-min',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://jextaqhknpvnhryfmjqu.supabase.co/functions/v1/send-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpleHRhcWhrbnB2bmhyeWZtanF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU2OTA2MjksImV4cCI6MjEwMTI2NjYyOX0.TUegp5KxvWuHz6bkD8qv0oc_yMLrF9pKUwR6-o8Cnfo'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Per verificare che sia stato creato:
-- select * from cron.job;

-- Per rimuoverlo in futuro (es. se si vuole rifare):
-- select cron.unschedule('send-notifications-every-5-min');
