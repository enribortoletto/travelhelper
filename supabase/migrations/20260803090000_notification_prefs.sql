-- Preferenze di notifica granulari per regola (05-notification-rules.md),
-- richieste dalla nuova sezione Impostazioni: l'utente può disattivare
-- singolarmente recap, promemoria, ritardi e variazioni di percorrenza
-- invece di un unico interruttore per tutte le notifiche push.

alter table user_settings
  add column notification_prefs jsonb not null default jsonb_build_object(
    'recap', true,
    'promemoria_30', true,
    'ritardo_5', true,
    'ritardo_30', true,
    'variazione_percorrenza', true
  );
