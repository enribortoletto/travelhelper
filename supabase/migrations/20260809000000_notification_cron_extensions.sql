-- §11: enable the extensions the notification-rules cron schedule needs.
-- The schedule itself (cron.schedule(...)) is set up separately, outside
-- tracked migrations, because it embeds a shared secret via Supabase Vault
-- that must never land in a file committed to source control.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;
