# Infrastructure setup instructions

Actionable checklist for provisioning every piece of infrastructure `01-core-logic-and-algorithms.md` and `02-technical-specification.md` require. Grouped by service; work through each group top to bottom. Every item is marked:

- **[Dashboard]** — requires a human clicking through an external provider's web console or CLI login; an agent cannot do this step.
- **[Code]** — an agent can generate or run this directly: migrations, policies, config files, functions, CLI commands.

**Stack note**: §14 (AI itinerary-editing assistant) is written provider-agnostic ("an LLM provider API with a web-search tool") — read every mention of an AI provider below as OpenAI.

---

## GitHub

- **[Dashboard]** Confirm the repository exists, with the frontend and the Supabase project (migrations, Edge Functions) either in the same repo or as linked workspaces.
- **[Code]** Add a CI workflow: deploy the frontend on push to the hosting target below, and apply Supabase migrations on merge to main.

## Hosting (frontend)

- **[Dashboard]** Provision a static/edge host with GitHub-integrated deploys (Vercel, Netlify, or Cloudflare Pages — any works, pick one) and point a real domain at it with HTTPS. Non-negotiable per §11: iOS push requires the PWA served over HTTPS with a valid manifest and Service Worker.
- **[Code]** Add the web app manifest and Service Worker registration to the frontend build.

## Supabase

- **[Dashboard]** Create the project; note the project URL, anon key, and service-role key.
- **[Code]** Migrations for every table in A3: `trips`, `trip_members`, `trip_invites`, `categories`, `events`, `travel_mode_overrides`, `event_travel_baseline`, `user_settings`, `notification_log`, `itinerary_change_log`, `ai_previews`.
- **[Code]** RLS policies per role/table per §15 — read for any member; write for `admin`/`editor`; membership/role changes `admin`-only; trip deletion and ownership transfer `owner`-only — plus a `service_role`-only write path for `is_derived = true` rows on `events`, so a client can never mutate a transit/check-in/check-out event directly (§7).
- **[Dashboard]** Enable email/password auth; configure the password-reset email template (Supabase's built-in flow, or custom SMTP routed through Resend — decide once, see Resend below).
- **[Code]** Enable Realtime on `events`, `categories`, `trip_members` (§15, C3).
- **[Code]** Four Edge Functions: AI assistant (§14), notifications job (§11), flight-tracking job (§12), calendar `.ics` feed (§13).
- **[Dashboard]** Deploy the `.ics` feed function with JWT verification off — the one endpoint that must stay public (§13).
- **[Code]** Schedule the notifications function every ~5 min and the flight function every ~3h via `pg_cron` (or Supabase Cron), both gated on trip phase per §17.

## Google Cloud

- **[Dashboard]** Enable: Maps JavaScript API, Places API (New), Directions API, and the Roads API (§4's Snap-to-Roads tie-breaker — the one that's easy to forget).
- **[Dashboard]** Create two API keys: one browser-restricted (HTTP referrer) for the client, one unrestricted for server-side Edge Function use (C1). Never reuse one key in both places.
- **[Code]** Store the server key as a Supabase secret; the client key as a frontend build-time env var.

## Resend

- **[Dashboard]** Verify a sending domain (SPF/DKIM) — required before delivery is reliable, not just account signup.
- **[Dashboard]** Generate the API key; store it as a Supabase secret.
- **[Code]** Wire it into the email-invite mechanism (§15) and, if chosen over Supabase's built-in flow above, the password-reset email via custom SMTP.

## OpenAI

- **[Dashboard]** Generate a server-side API key; confirm the account/model tier has web-search tool access enabled — §14 Flow 1 depends on it to look up real place details.
- **[Code]** Store the key as a Supabase secret, called only from the AI assistant Edge Function, never sent to the client (§14's explicit guardrail).

## Flight-data provider

- **[Dashboard]** Pick one (e.g. AeroDataBox via RapidAPI) and subscribe.
- **[Code]** Store the key as a Supabase secret, used only inside the flight-tracking Edge Function (§12).

## Web Push (VAPID)

- **[Code]** Generate a VAPID keypair (e.g. `npx web-push generate-vapid-keys`).
- **[Code]** Store both keys as Supabase secrets, used by the notifications Edge Function to sign push payloads (§11).

---

**Suggested order**: GitHub + hosting first (nothing else needs them, but the manifest/Service Worker requirement is easy to bolt on late and easy to forget early). Supabase schema and RLS before any feature that reads or writes through it. Google Cloud before building routing/maps features. Resend, OpenAI, the flight provider, and VAPID keys can each wait until the specific feature that needs them is actually being built — this roughly matches `02`'s own build order (C4).
