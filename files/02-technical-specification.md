# Technical specification — build guide

This is the complete, self-contained spec for building the trip-planning app described in this project — written for an AI-assisted ("vibe coded") build session: concrete enough to implement directly from, without needing to cross-reference the older, now-deleted planning docs from the original single-trip prototype (their old `00`–`05` numbering has since been reused by unrelated, current files in this same folder — don't confuse the two). This file and `01-core-logic-and-algorithms.md` (embedded below as Part B) supersede all of that earlier material.

**Structure**: Part A covers what to build and with what (stack, data model, screens). Part B — reproduced verbatim from `01-core-logic-and-algorithms.md` — is the authoritative source of every business rule, default, and edge case; nothing in Part A overrides it. Part C covers integration wiring and a suggested build order.

---

# Part A — Product, stack, and data model

## A1. Product overview

A collaborative, installable web app (PWA) that acts as the live diary and control tower for a group trip: a shared itinerary with real places, real travel times, and real opening hours, kept in sync across every member's device, with push alerts when reality drifts from the plan and an AI assistant to replan on the fly. Works for **any trip** — the data model has no hardcoded destination, dates, or venue.

Design principles (see Part B for the rules these imply):
- **Nothing is computed twice.** A travel time, a status, an opening-hours check — each has exactly one place it's computed and everyone else reads that value.
- **The AI never writes silently.** Every assistant-driven change is a preview the user confirms.
- **Derived things aren't editable.** Transit legs and check-in events are consequences of the plan, not inputs to it.
- **Real-world constraints are hard constraints.** Opening hours, kitchen closing times, check-in windows — these block scheduling, they don't just decorate it.

## A2. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | React + Tailwind CSS, installable PWA | Service Worker + manifest required for iOS push (Part B §11) |
| Backend | Postgres-based BaaS: Auth, Realtime (`postgres_changes`), Row-Level Security, Edge/serverless Functions | e.g. Supabase — RLS is what enforces roles (Part B §15), Realtime is what powers multi-user sync |
| Auth methods | Email/password (with a client-side strength check on sign-up) and a password-reset-by-email flow | Both are required capabilities, not just "Auth" left generic |
| Maps | A maps platform with JS/SDK maps, Places lookup, and a Directions/routing API | e.g. Google Maps Platform — split into a browser-restricted client key and an unrestricted server key (used by background jobs) |
| Calendar export | Server-generated `.ics` feed, no external service | Part B §13 |
| Push notifications | Web Push (Service Worker + Push API), VAPID keys | Part B §11 |
| AI assistant | An LLM provider API with a web-search tool, called only from a server-side function | OpenAI API — never call from the client, the API key must not be exposed (Part B §14) |
| Flight tracking | A flight-status data provider, queried from a scheduled job | Part B §12 |

## A3. Data model

All tables are scoped by `trip_id` and protected by RLS per Part B §15 (read: any member; write: `admin`/`editor` only; membership/role changes: `admin` only; trip deletion and ownership transfer: the trip's `owner` specifically, not just any `admin`).

**`trips`**
| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| name | text | drives the calendar export display name (§13) |
| start_date / end_date | date | |
| timezone | text (IANA) | Part B §1 — every time computation in the app keys off this |
| created_by | uuid → users | |
| created_at | timestamptz | |

**`trip_members`**
| Column | Type | Notes |
|---|---|---|
| trip_id, user_id | uuid, composite pk | |
| role | enum `admin`/`editor`/`viewer` | §15 |
| is_owner | bool, default false | exactly one `true` row per trip; a flag on top of `admin`, not a separate role (§15) |
| display_name | text | shown in "Updated by …" toasts |
| joined_at | timestamptz | |

**`trip_invites`** — `id, trip_id, role, token, invited_email (nullable), created_by, created_at, expires_at (nullable)` (§15) — one table backing both invite mechanisms: a shareable link (`invited_email` null, anyone with the token joins at `role`) and a direct email invite (`invited_email` set, sent to one address at `role`). Only `admin` can create either kind.

**`categories`**
| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| trip_id | uuid fk | |
| name | text | free text, user-defined (§10) |
| color | text (hex) | plus a derived theme token computed client-side |
| icon | text | icon identifier |
| is_system | bool | true only for the two seeded rows `accommodation` and `transport` — non-renameable, non-deletable |

**`events`** — the single table for every stop, transit leg, and check-in/check-out companion
| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| trip_id | uuid fk | |
| category_id | uuid fk → categories | |
| day | date, nullable | nullable until scheduled |
| name | text | |
| planning_status | enum `planned`/`optional`, nullable | null for derived events (§3); check constraint forbids `optional` when category = accommodation |
| is_skipped | bool | manual flag, highest-precedence input to `status_runtime` |
| status_runtime | enum `inactive`/`in_progress`/`skipped` | **persisted**, recomputed on every relevant write (§2) |
| start_time / end_time | time, nullable | |
| start_time_label / end_time_label | text, nullable | free-text placeholder ("to be confirmed") when no real time exists yet |
| visit_duration_minutes | int, nullable | recommended duration; feeds §2's manual-start calc and §14 Flow 1 placement |
| maps_place_id / maps_link | text, nullable | |
| website / price / description / contact | text, nullable | |
| opening_hours | jsonb, nullable | per-weekday `{open, close}`; §8 |
| kitchen_closing_time | time, nullable | food-service only; if null and venue closing time is known, treat as `closing_time − 1h` (§8) |
| check_in_window_start / check_in_window_end | time, nullable | accommodation only (§7) |
| checkout_deadline | time, nullable | accommodation only, a single cutoff not a window (§7) |
| weather_dependent | bool | |
| priority | enum `high`/`medium`/`low`, nullable | optional stops only |
| is_derived | bool | true for transit, check-in, and check-out events |
| derived_kind | enum `transit`/`checkin`/`checkout`, nullable | |
| transit_from_event_id / transit_to_event_id | uuid fk → events, nullable | transit events only |
| checkin_for_event_id / checkout_for_event_id | uuid fk → events, nullable | check-in/check-out events only, point at the parent accommodation stop |
| flight_number | text, nullable | |
| flight_leg | enum `departure`/`arrival`, nullable | |
| delay_minutes | int, default 0 | written by §12's flight job |
| created_by / updated_by | uuid fk | |
| updated_at | timestamptz | |

**`travel_mode_overrides`** — `trip_id, place_id_a, place_id_b, mode (driving/walking/transit), note` (§6)

**`event_travel_baseline`** — `trip_id, from_event_id, to_event_id, baseline_minutes, checked_at` (§11 rule 5) — `checked_at` is what §17's adaptive lookahead table (30/10/5-minute tiers by countdown to departure) checks against to decide whether a leg is actually due for a re-check on a given job run, instead of re-querying it every run regardless of tier.

**`user_settings`** — `user_id, trip_id, daily_recap_time, quiet_hours_start, quiet_hours_end, push_subscription (jsonb), notification_prefs (jsonb)` (§11)

**`notification_log`** — `trip_id, user_id, notification_type, event_id, day, created_at, title, body, read_at (nullable)`, unique constraint on `(trip_id, user_id, notification_type, event_id, day)` for the claim/dedup pattern (§11). The same row that claims dedup is also the persisted in-app history entry (§11) — `title`/`body` are what a notification-history screen renders, `read_at` (null = unread) is what an unread-count badge counts.

**`itinerary_change_log`** — `id, trip_id, event_id, change_type, old_value (jsonb), new_value (jsonb), triggered_by_user, ai_preview_id (nullable), created_at`

**`ai_previews`** — `id, trip_id, day, proposed_changes (jsonb), created_by, status (pending/confirmed/discarded), created_at` — the server-side staging row behind §14's preview-then-confirm principle

## A4. UI and screen structure — intentionally unspecified

This spec deliberately does **not** prescribe a navigation structure, screen breakdown, or layout (no fixed tab count, no mandated "Today/Trip/Calendar" split, no required component tree). That's an implementation decision to be made during the build, in whatever shape best serves the feature set below — a different information architecture is fine as long as every capability here is reachable somewhere and every rule in Part B is respected regardless of which screen triggers it.

**Capabilities the UI must expose, in some form:**
- Authentication: sign up (email/password, with a strength check), log in, and password reset — before any trip-specific screen is reachable.
- A list of the trips the signed-in user belongs to, with a way to switch between them and to create a new one (§16) — a user isn't confined to a single trip.
- A live, map-based view of what's happening now or next (runtime status, §2), with a way to open navigation to a stop (§9), mark it started early (§2), mark it delayed, and edit/delete it — edits and deletes always routed through the AI preview (§14), never a direct write.
- A trip-wide view of the full plan: all `planned` stops, the accommodation for each night, and trip-level progress/travel stats (§4, §7).
- A way to create, edit, reorder, and retime stops — the same editing surface used both for initial trip setup (§16) and for every later change — including toggling a stop's planning status between `planned`/`optional` (§3) and seeing/accepting AI-proposed `optional` stops that now fit, on whichever day(s) they fit (§14 Flow 1).
- A way to search the trip's own stops (by name, category, or place) — scoped to what's already in the itinerary, distinct from the place lookup that happens when adding something new (§14 Flow 1).
- Conflicts (opening hours §8, check-in/check-out §7, other stops) must always be shown explicitly, never silently absorbed, wherever a change is being made.
- A persisted, browsable notification history with an unread-count indicator (§11) — separate from, but populated by, the same push-notification rules, plus realtime collaboration updates (§15) if those are also meant to appear there.
- Trip settings: notification preferences and quiet hours (§11), trip basics (§1, §16), member/role management restricted to `admin` (§15) — including generating an invite link or sending an email invite, each with a role attached (§15) — trip deletion and ownership transfer restricted to the owner specifically (§15), category management (§10), and the PWA install prompt.
- Real-time sync (§15) must be reflected live regardless of which screen(s) the implementation ends up with.

---

# Part B — Core domain logic and algorithms

*(Reproduced verbatim from `01-core-logic-and-algorithms.md` — this is the single source of truth for every rule, default, and threshold referenced above. Section numbers below (§1–§17) are self-contained within this part.)*

## 1. Trip timezone

Every trip has a single IANA timezone (e.g. `"Europe/London"`, `"America/New_York"`), stored on the trip record, that all of its events are scheduled in.

**Rule**: any "now" vs. event-time comparison must derive the current day/time in the *trip's* timezone (via a timezone-aware formatter, not a raw local `Date`) and compare **strings** (`"yyyy-MM-dd"`, `"HH:mm:ss"`) — never construct a `Date` from a date/time string and compare it directly, since that gets interpreted in the *device's* local timezone.

**Why**: a user opening the app from a different timezone than the trip's (e.g. before departure, from home) would otherwise see "in progress" / "already happened" skewed by the offset between the two zones.

**Requirement**: use full IANA-timezone-aware conversion everywhere a trip's local time needs to be computed, including in exports (e.g. a calendar feed) — never assume a fixed UTC offset, since a trip's dates may span a daylight-saving transition or the trip may be scheduled anywhere in the world.

This logic must exist in exactly the same form on both the client (for immediate UI state) and any backend job that reasons about "what's happening right now" (notifications, delay detection) — implemented twice, once per runtime, since client and server don't share a module system, but behaviorally identical.

---

## 2. Event status

Three runtime statuses: `skipped`, `inactive`, `in_progress`.

| Status | Condition |
|---|---|
| `skipped` | manually marked cancelled, regardless of time |
| `inactive` | missing day or start time; or the event's day isn't today (trip timezone); or today but outside the `[start_time, end_time]` interval |
| `in_progress` | today, and the current time (trip timezone) is `>= start_time` and `<= end_time` |

**Rule: status must always be persisted to the database**, never held only in memory or recomputed independently by each client at render time. Implement it as a pure derivation function (`day`/`start_time`/`end_time`/`skipped` in, status out) whose result is written to a dedicated status column on the event row every time it changes — via a database trigger, a scheduled job, or a client-side write on every status-changing action (deduplicated so it doesn't produce redundant writes on every render). This is what makes:
- every connected client see the same status through realtime sync, without each one recomputing it against its own device clock;
- backend jobs (e.g. delay-notification rules) able to read the status directly from the row instead of re-deriving it;
- the change-history log able to record status transitions like any other change.

**Starting an activity early (or late)**: a user must be able to promote an `inactive` event to `in_progress` directly from the app (e.g. a "start now" action) — for example when the group runs ahead of schedule and wants to begin a stop before its planned `start_time`. This is **not** a separate override flag layered on top of the status derivation above; it's a concrete time edit, exactly like manually changing a stop's time (§14, Flow 3), just pre-filled by the app instead of typed by the user:
- `day` is set to today (trip timezone) if it wasn't already — otherwise the write below is pointless, since the status derivation in the table above requires the event's day to be today before it can ever read `in_progress`.
- `start_time` is set to the current time (trip timezone) at the moment the action is triggered.
- `end_time` is recomputed as `start_time` + that stop's known duration (e.g. the recommended visit duration already used when placing a stop, §14 Flow 1 — for a hike, that's its expected time-on-site). If the stop has no known duration on record, fall back to the same "+1 hour" convention used below for a missing end time.
- The computed `end_time` must never cross midnight — clamp to 23:59:59 the same day, same clamp as the missing-end-time fallback. An activity marked in-progress this way can never span more than one day.
- Because this writes real `start_time`/`end_time` values, the ordinary status derivation above applies unchanged afterward — no separate precedence rule or persistent flag is needed. Once the (now concrete) `end_time` passes, the event naturally reverts to `inactive` and picks up the "past" flag below, exactly like any other event.
- Like any other manual time edit, this triggers the same cascading recalculation as the rest of the day (§14, Flow 3) — including regenerating the adjacent transit events (§7), since starting something early or late shifts everything scheduled after it.

**Fallback for a missing end time**: `start_time + 1 hour`, never crossing midnight (clamp to 23:59:59 if `start_time` is already in the last hour of the day). Reuse this exact fallback anywhere an end time is needed but absent — exporting an event to a calendar feed, or starting an activity early per above.

**"Past" flag**: a lightweight completion indicator, independent of the runtime status — true if the event's day is in the past, or if it's today and past its end time (or the +1h fallback, or midnight if even the start time is missing). Purely a UI affordance; it must never feed into planning logic. This is deliberately a different predicate from the "has this happened yet" one used for trip/travel progress (§4): that one triggers off `start_time` and directly drives a progress bar, this one off `end_time` and never drives anything but a badge. Keep them separate — merging them into one "is it done" concept would change what the progress bar means.

---

## 3. Planning status: planned vs. optional

**Rule**: every *primary* stop — anything the user (or an assistant proposal) added directly, as opposed to a derived event, below — carries a **planning status**, `planned` or `optional`, orthogonal to its runtime status (§2) and to its category (§10). This is how a trip separates "this is happening" from "this is an idea, add it if it fits":

- **`planned`**: locked into the itinerary — it must be there. It participates in day-route ordering (§5), transit-event generation (§7), notifications (§11), and the calendar export (§13) exactly like anything else committed to the plan.
- **`optional`**: a candidate, not yet committed. Excluded from transit-event generation, notifications, and the calendar export — but it's exactly what the AI assistant (§14) draws from when a day has room: given the trip's current plan, the assistant evaluates the trip's `optional` stops and proposes any that would actually fit (time-wise, opening-hours-wise) as additions, through the same preview-then-confirm mechanism as any other assistant-driven change. A proposal isn't limited to the single day currently being viewed — the same `optional` stop can be evaluated against every day's free time and surfaced against whichever ones it actually fits (e.g. "fits Wednesday morning, or Friday afternoon"), since nothing about the stop itself is day-specific until it's accepted.

Users can move any primary stop between `planned` and `optional` at any time, in either direction — accepting an assistant proposal sets a stop to `planned`; deciding a previously-committed stop isn't going to happen after all sets it back to `optional` (or it can simply be deleted, if it's not worth keeping as an idea) — **except accommodation, below, where only `planned` is ever a legal value.**

**Accommodation is always `planned`, never `optional`**: an accommodation stop represents a real booking for a specific night, and every night of the trip needs one — it can't be a "maybe." The field exists on accommodation exactly as it does on every other primary stop (one column, one enum, no special-cased schema) — it's simply never allowed to hold `optional` there, enforced by a check constraint, with the same rule enforced again at the AI assistant's guardrail level (§14) as defense in depth, not as the only place it's enforced.

**Derived events carry no planning status field at all — not "always planned," genuinely absent**: transit events and check-in/check-out companion events (all §7) aren't primary stops, so this field doesn't apply to them the way it applies to everything above. Their presence on the calendar is entirely a side effect of their generating stops (a transit event exists only between two stops that are both currently `planned`; a check-in or check-out event exists only while its parent accommodation — always `planned`, per above — has the corresponding window or deadline set). There is no independent switch a user can flip on a derived event itself.

---

## 4. Trip progress

Given the trip record and the current instant, compute:
- **phase**: `"before"` if today precedes the trip's start date, `"after"` if today follows the end date, otherwise `"during"`.
- **day index**: 1-based, set only while `"during"` (which day of the trip today is).
- **days until start**: negative once the trip has started or finished.

Implement a shared "has this happened yet" predicate, taking a day, an optional start time, the trip phase, today's date, and the current time — applied uniformly to every event, with no special case needed for travel legs, since a transit leg is itself a first-class event (§7) with its own day/start_time, not a separate structure requiring its own version of this check:
- trip not started yet → nothing has happened;
- trip finished → everything has happened;
- during the trip → happened if the day is in the past, or if it's today **and** the start time is known and has already passed (without a start time, an event scheduled for today can't be counted as done — there's no way to know).

Reduce this to a single "stops progress" fraction — how many of the trip's stops have already happened, over the total — for an overall progress indicator. Only `planned` stops (§3) count toward this total; `optional` ones aren't part of the committed plan yet.

**Position confirmation for `in_progress`**: the clock-derived `in_progress` status (§2) says an event *should* be happening now — it never confirms the group is actually there. When device geolocation is available (the same opt-in, non-blocking permission as §6's "Distance from current location" — denied or unavailable must never block anything, this is a confirmation signal layered on top of the clock, never a replacement for it), cross-check live position against whichever event is currently `in_progress`:
- if it's a transit event (category `transport`, §7): confirmed if the live position falls along the route between the leg's origin and destination place — a real signal that the group is actually moving through the journey, not just that the clock window for it happens to be open;
- if it's a stationary stop (an activity, a meal, anything else): confirmed if the live position is within **500 meters** of the stop's place location — a real signal they've actually arrived, not just that the clock says they should have.
- This never changes the persisted `status_runtime` itself (§2's derivation stays the single source of truth, always available even without location permission) — it's an additional, optional "position confirmed / doesn't match" signal alongside it, for the UI to surface and for notifications to use. It's specifically what closes the gap §11's delay rules otherwise can't cover on their own: "the group hasn't actually left the previous stop yet even though the plan says they should have" now has a real signal — a stop still showing "position doesn't match" well past its planned window — instead of being unobservable.

**Device geolocation is imprecise — treat it as a circle, not a point, and never alarm on a single reading:**
- The browser's Geolocation API always returns an **accuracy radius** in meters alongside the coordinates (GPS fixes are typically accurate to ~5–20m, WiFi/cell fallback to ~100m–a few km, IP-only fallback to tens or hundreds of km) — never compare the raw lat/lng to a threshold without accounting for this. Compute the *effective* distance as the raw distance minus the reported accuracy radius before comparing to the 500m / route-corridor threshold.
- **Discard low-quality fixes outright**: if the reported accuracy is worse than a sanity ceiling (recommended: 2 km — beyond typical GPS/WiFi range, indicative of IP-based fallback), don't use that reading for confirmation at all; treat it the same as no permission granted.
- **Discard stale fixes**: use a short `maximumAge` (or check the fix's own timestamp) — a fix that's a few minutes old can no longer speak to "right now."
- **Three states, not two**: `confirmed`, `unconfirmed` (the default — no permission, poor accuracy, stale fix, or not yet corroborated), and `mismatch`. Never skip straight to `mismatch` from a single reading: require at least 2–3 consecutive readings, a short interval apart, that all disagree beyond the accuracy-adjusted threshold before surfacing it. A single wildly-off fix — common right as a device falls back from GPS to a coarser method — must never alone flip the signal. The UI must render `unconfirmed` as neutral, never as a warning.
- Even a corroborated `mismatch` stays a soft, dismissible signal, consistent with the rest of this document — it never changes `status_runtime`, never auto-skips or auto-edits an event.

**Resolving genuinely ambiguous transit-corridor cases with Snap to Roads**: for the transit case above, when a fix's accuracy circle straddles the corridor boundary (neither clearly inside nor clearly outside even after the accuracy adjustment), a routing platform's road-snapping capability (e.g., Google Maps Platform's Roads API) can disambiguate by aligning the raw fix to the nearest plausible road segment before re-checking it against the route. This is a paid, rate-limited tie-breaker, not a default step — see §17 for the call-budget rule governing it. It is never useful for the stationary 500m case, which is a plain point-radius check against an already-known place location and needs no road context.

---

## 5. Day route ordering

**Rule**: the stop order used to **draw a day's route on a map** starts at the accommodation slept in the **previous night** (where the day began) and ends at the accommodation for the **upcoming night** (where the day ends) — even when the latter isn't chronologically the last event of the day (e.g. a dinner scheduled after check-in still comes before the accommodation stop in the drawn route, since geographically the day still ends there).

- First day of the trip: no "opening" accommodation to prepend (there was no previous night on this trip).
- Last day of the trip: no "closing" accommodation to append (no upcoming night on this trip).
- Expose the boundary accommodation ids (previous night / next night) separately from the rest of the day's stops, so a UI can visually distinguish them in a detailed itinerary view instead of listing them as an ordinary stop.
- When looking up "the accommodation event of the day" for this purpose, resolve specifically the original accommodation stop — never a check-in companion event auto-generated for it (§7): the companion is a time-bound arrival window, the accommodation stop itself is the (not time-bound) boundary anchor described here. The two must never be conflated.

This same origin-to-destination sequence — previous-night accommodation, the day's stops in order, next-night accommodation — is also the backbone the itinerary list is built from once transit events are materialized between each pair (§7): the visible list and the map route converge on the same chronological sequence, instead of being two independently ordered views of the same day.

---

## 6. Travel mode and travel-time estimation

**Default rule**: driving, unless a trip-specific override applies.

**Per-trip travel-mode overrides**: maintain a small override table — `travel_mode_overrides(trip_id, place_id_a, place_id_b, mode, note)` — checked before falling back to the driving default for any pair of places. This covers cases that are properties of a *specific pair of places* on a *specific trip*, which can't be derived from event categories alone:
- a **transit-only** override for a leg where a car isn't available for that specific hop (e.g. between a rental-car return point and wherever the traveler goes next) and it isn't walkable either;
- a **walking** override for a place pair that's effectively adjacent in real life (e.g. lodging attached to or across the street from a transit hub) even though a generic estimate would suggest otherwise.

**Time/distance estimation**: sourced from a routing API given two place identifiers and a travel mode, with:
- a **cache** keyed by `(origin, destination, mode)`, shared across every consumer, so the same leg is never requested twice in a session;
- a short **retry cooldown** applied only to failures (a transient network/rate-limit error shouldn't block that leg for the rest of the session; a successful lookup is cached indefinitely);
- a pub/sub pattern so multiple UI components requesting the same leg concurrently share one in-flight request and update together.

**Consecutive-leg extraction**: for each day, walk the origin-to-destination sequence from §5 (previous-night accommodation → the day's stops in order → next-night accommodation) and generate the consecutive pairs between them — this is the unit that travel-time estimates are computed over, and the input to generating the transit events described in §7.

**Distance from current location**: same routing API, but with the origin set to the user's live device location (browser/device geolocation permission) rather than another stop. If permission is denied or unavailable, this must stay silently empty — it's an enrichment, never allowed to block anything else from rendering.

---

## 7. Auto-generated transit events

**Rule**: every travel leg between two consecutive stops in a day's sequence (§5) — including the boundary accommodation events — must be materialized as its **own calendar event**, category `transport`, positioned chronologically between its origin and destination. It is not an inline annotation or a connector drawn between two other events: it is a first-class event with its own `start_time`, `end_time`, and duration, exactly like any stop.

**Worked example**: the group starts the day at their accommodation (the departure point), then wants to hike at a nature park that takes 2 hours to visit and 3 hours to drive to. The day's itinerary must show **three** events, in order: the accommodation (departure point), a transit event covering the 3-hour drive, and the park visit (a 2-hour block) — not two stops with the travel time hidden in a tooltip between them.

**Generation**: whenever two consecutive `planned` stops (§3) in the day's sequence both have a resolvable place identifier, and no transit event already links them, generate one automatically. A transit event is fully derived and **cannot be manually edited, retimed, started early (§2), or skipped by the user** — the same protection extends to check-in and departure events below, for the same reason: none of them has an independent existence apart from the stops it's derived from. Its existence, timing, and duration are recomputed whenever anything about either endpoint changes (place, time, reordering, planning-status change, becoming `skipped`, or removal) — a stop marked `skipped` (§2) is treated exactly like a removal for this purpose, since it drops out of the active route the same way — following the same cascading-recalculation logic used for any other itinerary edit (§14, Flows 2–3). Wanting a different duration, a different travel mode, or to skip the leg entirely always means editing one of the two endpoint stops (or the per-trip travel-mode override, §6) — never the transit event itself.

**Timing**:
- `start_time` = the origin's actual departure time: its `end_time` if known, otherwise its `start_time`, otherwise — e.g. a morning departure from an overnight accommodation with no generated departure event (see "Departure events" below) or explicit checkout time — a trip-level default "day start" time.
- duration = the routing estimate between the two places for the applicable travel mode (§6, including any per-trip travel-mode override), optionally including the same proportional break allowance used for long driving legs elsewhere in the app (§14, Flow 1).
- `end_time` = `start_time` + duration. This computed arrival time becomes the destination stop's own start time — **unless the destination is an accommodation stop with a declared check-in window, in which case the real arrival target is that accommodation's generated check-in event (see "Check-in events" below) — which may itself start later than the raw arrival time, if the group gets there before the window opens — not the accommodation stop's own position at the end of the day.** For any other destination, the computed arrival must also respect that place's own opening-hours constraints (§8) — arriving after its latest legal start time is exactly the same kind of conflict as missing a check-in window, just against a different boundary. If the destination stop already carries a manually fixed `start_time` earlier than this computed arrival, that is a scheduling conflict and must be surfaced the same way any other itinerary conflict is (§14) — never silently overwritten.

**Check-in events (accommodation only)**: an accommodation stop represents *where the group sleeps that night* — per §5 it is always sequenced as the day's last stop, regardless of when, chronologically, everything else happens. Arriving there can still carry real time constraints, though: properties publish a check-in **window** — an opening and a closing time (e.g. 15:00–20:00), not a single cutoff — typically sourced the same way other place details are (§14, Flow 1's web/places lookups). Conflating "must physically arrive within a window" with "is positioned last in the day" is what causes false scheduling conflicts, so the two are modeled as two separate events:
- If an accommodation stop has a declared check-in window, generate a **distinct, derived companion event** — named `"Check-in {accommodation name}"` — category `accommodation`, but flagged as a system-generated sub-event, never the boundary anchor that §5 looks for (that anchor stays the original accommodation stop).
- Fixed duration: **30 minutes**, applied uniformly regardless of accommodation type — a flat assumption, not something computed per property.
- **Placement within the window**: `start_time` = the *later* of (a) the incoming transit leg's computed arrival, or (b) the window's opening time — arriving before the property will even let you check in doesn't pull check-in earlier, it just means the group waits (or fills the gap with something else, see below). `end_time` = `start_time` + 30 minutes.
- **Conflict**: if that `end_time` would fall after the window's closing time — arriving too late, or too close to closing, to fit the 30 minutes in before it shuts — that's a genuine scheduling conflict and must be surfaced (§14). **This, not comparing against the accommodation stop's own end-of-day position, is the one legitimate arrival-time check**: that stop isn't time-bound (§5), the check-in window is.
- Once check-in is done, the rest of the day is free: any other stop (dinner, a visit, anything else — including, if the group arrived before the window opened, something to fill that wait) can be scheduled around the check-in event's actual placement. The group still returns to the accommodation stop itself at the end of the day (§5's boundary anchor) with no further time constraint — it's a place to be that night, not a second deadline.
- If an accommodation has no declared check-in window, skip this entirely — the plain accommodation stop is enough, exactly as before.
- Like transit events, a check-in event is not directly editable, retimeable, startable-early, or skippable by the user (see "Generation" above) — it exists exactly as long as, and exactly as computed from, its parent accommodation's window, and it carries no planning status of its own (§3): it's present whenever the parent accommodation (always `planned`) has a window set, absent otherwise.

**Departure events (accommodation only)**: the morning mirror of check-in events, for the same reason — an accommodation stop isn't time-bound (§5), but leaving it can still be, when the property enforces a checkout deadline (e.g. "out by 11:00"). Unlike check-in's window, this is a single **upper bound**, not a window with two edges — there's no meaningful "opens at" for leaving, only a "must be gone by."
- If an accommodation stop has a declared checkout deadline, generate a **distinct, derived companion event** — named `"Check-out {accommodation name}"` — category `accommodation`, system-generated, never the boundary anchor that §5 looks for.
- Fixed duration: **15 minutes** (shorter than check-in's 30 — settling up and handing back keys is typically quicker than checking in), applied uniformly regardless of accommodation type.
- **Placement**: `end_time` = the *earlier* of (a) the checkout deadline, or (b) the departure time the day's actual first commitment requires — computed backward from it the same way §8 computes a latest legal start time, chained back through the outgoing transit leg. If nothing that day drives an earlier departure, it defaults to the deadline itself — the latest reasonable moment, maximizing time at the accommodation before it has to become a hard constraint rather than a default. `start_time` = `end_time − 15min`.
- **Conflict**: if even departing at the exact deadline doesn't leave enough time to reach the day's first real commitment on time, that's a genuine conflict — the checkout deadline is a hard floor under how early the day can start, and it must be surfaced the same way any other itinerary conflict is (§14), never silently absorbed by pushing the first commitment late.
- This departure event — not the accommodation stop's own (non-time-bound) position — becomes the origin for that day's first outgoing transit leg (see "Timing" above): the leg's `start_time` is this event's `end_time`, the same way any other stop's actual departure time feeds the next leg.
- If an accommodation has no declared checkout deadline, skip this entirely — the plain accommodation stop is enough, exactly as before, and the next day's first leg falls back to the trip-level default "day start" time per "Timing" above.
- Like check-in events, a departure event is not directly editable, retimeable, startable-early, or skippable by the user, carries no planning status of its own (§3), and exists exactly as long as its parent accommodation's checkout deadline is set.

**Naming**: derive a label from the two endpoints (e.g. "Travel to {destination name}") for transit legs; check-in and departure events use the fixed `"Check-in {accommodation name}"` / `"Check-out {accommodation name}"` formats above instead — so every generated event reads naturally without manual titling.

**Single source of truth**: once legs exist as real events, everywhere else in the app that needs a leg's duration or distance — an inline "N min to next stop" indicator, a "distance/time traveled so far" trip-level stat, the calendar export — must read it from the transit event itself instead of independently recomputing the pair. One computation per leg, reused everywhere, so the number shown on the map, in the list, in the stats, and in any exported calendar always agrees.

**Delay detection**: a transit leg's delay is always the gap between its **planned** `end_time` (the arrival time computed at generation or last recalculation) and a **live** arrival estimate re-queried from the same routing API (§6) as the trip progresses — not a one-off computation, but the same estimation mechanism kept fresh. This live-vs-planned gap is exactly what the notification rules (§11, rules 3–5) act on, and what a delay-triggered re-planning preview (§11, §14) is computed against.

---

## 8. Opening hours and closing-time constraints

**Rule**: every stop tied to a real place — an activity, a museum, a restaurant, a pub, or any other category besides `accommodation`/`transport` (§10) — has opening hours, and those hours are a hard scheduling constraint, not just informational display text. Fetch them automatically online whenever a day is planned (the same web/places lookup already used elsewhere, §14 Flow 1) and store them per place; hours commonly vary by day of week, so keep a full weekly pattern, not a single flat pair.

**Latest legal start time**: for a stop with a known visit duration and a known closing time, `start_time` can never be later than `closing_time − duration` — the whole visit has to fit before closing. Worked example: a museum open 12:00–16:00, a 2-hour visit → the latest legal `start_time` is 14:00. This is the same shape of constraint as the accommodation check-in window (§7): a place-level time boundary the stop's own timing must respect, checked whenever a stop is placed or moved (§14, Flows 1 and 3) and whenever an upstream delay recomputes it (§7's delay detection, §11 rules 3–5).

**Earliest legal start time**: symmetrically, `start_time` can never be earlier than the place's opening time.

**Restaurants and pubs — the kitchen closes before the venue does**: for any food-service stop, the closing time that actually matters for scheduling is when the *kitchen* stops serving, not when the venue itself closes — a pub open until 23:00 with a kitchen that stops at 19:00 means the last legal `start_time` for a meal is computed against 19:00, not 23:00. Fetch kitchen closing time as its own value where available, distinct from the venue's general closing time. **If it can't be determined automatically, default to the venue's general closing time minus 1 hour.**

**Conflicts**: the same conflict-and-preview mechanism as everywhere else (§7's check-in-window conflict, §14's guardrails) — a stop that can't fit within its place's hours, or whose upstream transit-caused delay pushes it past the latest legal start time, must be surfaced explicitly with a proposed resolution, never silently scheduled anyway.

---

## 9. Navigation deep link

Given a stop with a place identifier, build a universal maps "directions" URL/intent that opens the user's native maps app on mobile and falls back to a web maps URL in the browser. If no place identifier is available, fall back to a raw stored link for that stop, or nothing if that's missing too.

---

## 10. Categories

**Rule**: categories are **user-defined data, not a fixed enum**. A trip can start with a single category or with dozens — there is no minimum or maximum beyond what's usable in a UI — and the name of every category (other than the two reserved ones below) is whatever the user typed in, not a value chosen from a hardcoded list. This means categories must live in their own table (e.g. `categories(id, trip_id, name, color, icon, is_system)`), referenced by each event via a foreign key, instead of being a fixed database enum type. Each user-created category needs at minimum a name and a color; an icon can be chosen from a set or left to a sensible default.

**Two reserved, non-editable categories**: `accommodation` and `transport` always exist for every trip, cannot be renamed, deleted, or recreated by the user, and are the only categories the system itself relies on for behavior rather than pure display:
- `accommodation` is what the day-route ordering (§5) looks for to find the previous/next night's boundary stop, and what the check-in-event logic (§7) hangs off of;
- `transport` is what the auto-generated transit events (§7) are categorized as, and is what any manually added transport-related entry should also use so both render identically.

Every other category — waypoints, activities, meals, downtime, notes, or anything else a user invents — is free-form, fully renameable, fully deletable (with events in it reassigned or left uncategorized, implementation's choice), and carries no special logic anywhere in the app.

**Styling**: every category, reserved or user-defined, needs a display label, a **theme-aware color token** (for the app's own styling) **and** the same color as a plain hex value (needed anywhere the styling layer can't be read, e.g. map marker rendering, which typically only accepts literal colors), plus an icon. For user-defined categories these are chosen at creation time (e.g. a color picker, an icon picker) rather than hardcoded; derive a pastel "badge" variant of each category's style programmatically from its single solid color (e.g. via a color-mix function) rather than hand-authoring a second color per category, so creating a new category never requires manually tuning a matching tint.

---

## 11. Push notification rules

**Cross-platform requirement**: push delivery must work on both **iOS** and **Android**, for every user regardless of device — this isn't optional platform support, it's a baseline requirement, since a trip's group is expected to mix device types. Use the standard Web Push protocol (Service Worker + Push API) so a single backend implementation delivers to both, rather than building separate native push pipelines per platform. The two platforms differ enough in prerequisites that each needs explicit handling:
- **iOS (Safari-based PWA)**: Web Push only works from a PWA that the user has actually added to their home screen (Safari does not support Web Push for a page opened in the regular browser tab); this in turn requires a valid web app manifest and a registered Service Worker served over HTTPS. The app must therefore prompt the user to install it to the home screen before it can ever ask for notification permission, and the permission request itself should only fire from a deliberate user action after install — not automatically on load, which iOS Safari is more likely to suppress or which reads as spammy.
- **Android (Chromium-based browsers)**: Web Push works directly in the browser without requiring installation, though installing as a PWA is still worth offering for a more app-like experience; permission can be requested on first relevant use without the install prerequisite iOS has.
- Both platforms end up subscribed through the same Push API mechanism server-side (one `push_subscription` per device, keyed to the user), so the notification rules below run identically regardless of platform — the platform difference is entirely in *how a subscription is obtained*, never in what gets sent or when.
- Test the full install → permission → delivery flow on both platforms before shipping, since this is the area most likely to silently break per-platform (e.g. an iOS PWA losing its subscription after an OS update, or a permission prompt firing at a point iOS ignores).

Evaluate on a periodic job (recommended cadence: every ~5 minutes; the job's "did this just happen" tolerance window must match or exceed the actual run cadence, or events near a boundary get missed). For each user with an active push subscription:

0. **Quiet hours**: if the current time (trip timezone) falls within that user's configured quiet-hours window (must support windows that cross midnight, e.g. 22:00–08:00), skip all notification evaluation for them in this run.
1. **Daily recap**: once, at the user's configured recap time, a summary of today's `planned` (§3) stops with their times.
2. **Reminder before start**: for each of today's `planned` stops with a start time, a heads-up a fixed number of minutes before it starts (recommended default: 30 minutes).
3. **Short delay**: delay is a property of *travel*, never of a stationary stop — a stop running exactly on schedule must never trigger this, no matter how long its own duration is. So: for the day's currently `in_progress` transit event (§7) only, re-query its live arrival estimate and compare it to its planned `end_time` (§7's live-vs-planned gap). Once that gap crosses a first threshold (recommended default: 5 minutes), notify with the updated arrival time so the user immediately sees the knock-on effect. If no transit event is currently in progress (the group is mid-activity, not mid-travel), this rule simply has nothing to evaluate.
4. **Long delay**: same check as rule 3, second higher threshold (recommended default: 30 minutes), a more prominent message. Additionally, if the accumulated delay threatens a later `planned` stop that same day — not enough time left to fit it as planned, or a fixed commitment at risk (a closing time, a check-in window closing, a reservation) — generate a re-planning preview via the AI assistant (§14, Flow 2) with a concrete proposed resolution: drop the at-risk stop, swap it for a currently-`optional` stop (§3) that still fits, shorten the time allotted to later stops, or move the at-risk stop to a different day that still has room for it. Never apply any of this automatically — surface it and require the user's explicit confirmation, per the assistant's standing no-silent-write principle.
5. **Travel-time variation**: the look-ahead counterpart to rules 3–4 — checked on the *next* scheduled leg, before the group has even set off on it, rather than on one already in progress. Compare the **current** estimated travel time for that leg against a **baseline** recorded the first time it was checked (one stored baseline per leg). Notify only if the deviation is **significant** by two joint conditions — an absolute floor (recommended: at least 10 minutes) **and** a relative floor (recommended: at least 25% over baseline) — both required, not just one, to avoid false alarms on short legs (where a fixed number of minutes is a huge proportion) or on long legs (where a fixed percentage is a huge absolute swing). When the deviation is large enough to also threaten a later stop the same day, trigger the same re-planning preview described in rule 4, rather than a bare notification.

**Scope note**: rules 3–5 on their own can only detect delay that shows up as a *slower route* (traffic, closures, live conditions) — they compare a live routing estimate against a plan, nothing more. The other failure mode — "the group simply hasn't left the previous stop yet even though the plan says they should have" — is covered separately by §4's position-confirmation signal, when geolocation is available: a stop still showing "position doesn't match" well past its planned window is exactly that case. That signal stays opt-in and non-blocking (§4, §6), so without location permission this failure mode goes back to being unobservable rather than treated as a bug.

**Deduplication**: send every notification through a "claim" pattern — an insert into a log table keyed by `(notification_type, event_id_or_day)` guarded by a unique constraint. A duplicate insert is rejected by the database and the job treats that notification as already sent — this makes double-sends impossible even with overlapping/concurrent job runs, with no separate locking mechanism needed.

Make each rule **individually toggleable per user**, defaulting to enabled if the user has no saved preferences yet.

**In-app notification history**: a push notification is fire-and-forget by nature (§11 above) — it reaches the device once, and if missed or dismissed, the information behind it shouldn't be lost. Every notification that gets sent by the rules above must also be persisted as a durable, browsable entry (title, body, the event/day it relates to, a timestamp, and a read/unread flag) so a user can open an in-app history and see everything they were sent, in order, whether or not the push itself was seen. The same dedup "claim" row already used to prevent double-sends (above) is the natural place to carry this — it's already inserted exactly once per notification. A collaborative realtime update (another member's change, §15's "Updated by [name]" notice) is a different kind of event — informational, not one of the five push rules — but if it's also surfaced in this same history feed, it should be written through the same persisted-entry shape, not a separate mechanism, so one feed covers "things that happened" regardless of source. Marking an entry read is a simple per-user flag flip, never destructive (no entry is ever deleted by reading it), and an unread count over this feed is what a notification-bell badge should be counting.

---

## 12. Flight tracking

A periodic job (recommended cadence: every few hours — live flight data is only meaningfully different close to the flight, and third-party flight-data providers typically cap free-tier request volume). For each event carrying a flight number, scoped to a **narrow time window around the flight** (e.g. today or tomorrow in the trip's timezone) — outside that window the flight keeps its manually-entered time/label, since live data isn't useful or available further out:

1. Query a flight-data provider for that flight number on that date.
2. If the provider returns multiple matches for the same flight number (can happen across adjacent dates), pick the one whose scheduled time for the leg of interest (departure or arrival, depending on which leg this event represents) matches the expected day.
3. Compute delay in minutes as the (non-negative) difference between the revised/predicted time and the originally scheduled time; zero if no revision is available.
4. Map provider-specific cancelled/diverted statuses onto the event's display label, leaving the label untouched for every other status.
5. Write only to fields that are already rendered elsewhere in the app for delay/status display, and deliver the update to clients through the same realtime sync used for every other event change — no dedicated delivery path needed for this feature specifically.

---

## 13. Calendar export feed

- Include **only** events that are `planned` (§3) **and** have both a day and a start time set — `optional` stops and unscheduled events are left out of the export. Auto-generated transit events (§7) are exported like any other planned event, so the exported calendar shows the same travel blocks as the in-app itinerary.
- Regenerate **on every request** rather than persisting a cached copy, with a short HTTP cache header (recommended: a few minutes) so a calendar app polling frequently doesn't force a recompute on every poll.
- Keep this endpoint **publicly reachable without authentication**: calendar apps subscribing to a feed URL don't send auth headers, so it must be excluded from whatever auth gate protects the rest of the API surface. Use the feed URL itself as the access control (unguessable per-trip token) rather than a login.
- Reuse the same "+1h same day" fallback as event status (§2) when an event's end time is missing.
- Follow the export format's line-folding rules (e.g. the iCalendar spec's 75-octet limit per line).
- Derive the calendar's display name from the trip's own name, so the export is meaningful for any trip without per-trip code changes.

---

## 14. AI itinerary-editing assistant

**General principle**: no direct write to the itinerary from an AI-driven action. Every change first produces a **preview** — a temporary, not-yet-persisted proposal showing the day's new state and what specifically changes (old time → new time, stops shifted, transit events regenerated, conflicts detected). The user must explicitly confirm before anything is written, and every confirmed write is recorded in the change-history log. Run this server-side only, so the underlying AI provider's credentials are never exposed to the client.

- **Flow 1 — Add a stop**: given a name, a pasted map link, or a place identifier, look up (via web search and/or a places API) its location, a plausible category, opening hours (including, for food-service places, kitchen closing time where distinct from the venue's own — §8), price, a short description, and a recommended visit duration. Propose where in the day to insert it by computing real travel times to/from the adjacent stops, **including a proportional break allowance on long driving legs** (recommended default: roughly a 15-minute break per hour of driving, applied to legs longer than about 20–25 minutes) — this feeds directly into the duration of the transit events (§7) generated on either side of the new stop. Check for conflicts against the place's opening-hours constraints (§8) and against the day's other fixed stops; if there's a conflict, surface it explicitly with a suggested alternative instead of silently ignoring it. This same flow also covers the assistant *proactively* surfacing an existing `optional` stop (§3) that now fits into free time on one or more days — there's no new lookup needed in that case, just a scheduling proposal (or several, one per day it fits) for a stop whose data already exists.
- **Flow 2 — Remove a stop / report a delay**: cascade-recalculate every later stop that same day (a pure computation using already-known travel times — no external lookup needed), regenerating the transit events (§7) on both sides of the change — the same cascade applies whether the stop was actually deleted or just marked `skipped` (§2), since both remove it from the active route identically. If the accumulated delay puts a fixed commitment at risk (a closing time, a check-in window closing, a reservation), or there's no longer enough time to fit a later stop as planned, propose a concrete resolution: drop the at-risk stop, swap it for a currently-`optional` stop (§3) that still fits, shorten the time allotted to later stops, or move it to a different day that still has room — never applied without the user's confirmation.
- **Flow 3 — Manually edit a time**: same cascading recalculation as Flow 2, including regenerating the adjacent transit events (§7). Flag conflicts against known opening-hours constraints (§8) or other stops instead of silently saving a plan that no longer works.
- **Guardrails**:
  - never modify an accommodation stop's own booking details (dates, check-in window, checkout deadline) without a separate, explicit confirmation — they're tied to real-world bookings outside the app's control (this is about the accommodation stop's *fields*, not the derived check-in/check-out events below, which are a different thing that happens to share the name);
  - never set an accommodation stop's planning status to `optional` (§3) — accommodation is always `planned`;
  - never directly edit, retime, start early (§2), or skip a transit event or a check-in/check-out companion event (all §7) — none of them has an independent existence; achieving a change there always means editing one of the transit event's two endpoint stops, or the accommodation's check-in window or checkout deadline, instead;
  - never fabricate a price, time, or address that a lookup didn't actually return — state the uncertainty in the preview instead of writing a plausible-but-unverified value;
  - never auto-save without the confirmation step above.

---

## 15. Multi-user, roles, and sync

**Roles**: every trip member has exactly one role on that trip — `admin`, `editor`, or `viewer` — stored on the trip-membership record itself, not on the user globally (the same person can be `admin` on one trip and `viewer` on another they were only invited to look at).

| Role | Can do |
|---|---|
| `admin` | Add new users to the trip, and change the role of any existing member (promote/demote), on top of full editor-level access to the trip and its stops. A trip should always retain at least one `admin`, so removing/demoting the last one must be blocked — otherwise the trip becomes unmanageable. |
| `editor` | Read and modify the trip and its stops/events: create, edit, delete, reorder, change status. Cannot manage membership or change anyone's role. |
| `viewer` | Read-only: can open and use the app — browse the itinerary, map, and stats — but every write action (add/edit/delete a stop, change a status, resolve a conflict) must be rejected for them. |

**Enforcement**: apply this at the database layer (row-level security scoped by trip membership *and* role), not only by hiding write controls in the client UI — a `viewer`'s write attempt, or any request bypassing the UI entirely, must be rejected server-side.

**Owner — a flag on top of `admin`, not a fourth role**: exactly one member per trip is the owner, defaulting to whoever created it (§16). Being owner grants exactly two things a regular `admin` doesn't have: sole authority to delete the entire trip, and sole authority to transfer ownership to another `admin`. Everything else an owner can do, any `admin` can already do — this stays a flag (`is_owner`) on the membership record rather than a new role value, so the role enum itself (the table above) doesn't grow just to express "and also the one who owns it." A trip can never end up with zero owners: transferring ownership is the only way to change who holds it, there's no "remove the owner" path that doesn't go through a transfer first. This is stronger than the "last admin" protection above — removing the owner as a member must be blocked even when other admins exist, since the last-admin rule alone doesn't fire in that case and would otherwise let the trip end up with an admin but no owner. Ownership must be transferred to another admin *before* the current owner can be removed, demoted, or can leave the trip, regardless of how many other admins are present.

**Inviting members**: two mechanisms, both assigning a role at the moment of invitation rather than defaulting everyone to the same one — a shareable trip link (anyone with the link can join, at the role the link was generated for) and a direct email invite (sent to one specific address, at a role chosen when sending it). Either way, only `admin` can generate an invite of either kind, and the role attached to an invite can always be changed later by an `admin` exactly like any other member's role.

**Sync**: real-time updates apply to all roles equally — remote inserts/updates/deletes update every connected client's local state without a manual refetch, regardless of whether that client can write.

**Conflict handling**: no locking among the users who can write (`admin`/`editor`) — last write wins. When a remote update didn't originate from the current user, show a lightweight "Updated by [name]" notice resolved from trip membership — informational only, never blocking.

---

## 16. Trip creation and data entry

**Rule**: creating and populating a trip must be possible **entirely in-app**, through a lightweight built-in CMS — not only via an external script or a one-off import run outside the product. A trip's creator should never need a separate admin tool, a database console, or a developer's help to stand up a new trip from nothing.

**Minimum creation flow**:
1. **Trip basics**: name, start date, end date, and timezone (§1) — required up front, since every later time computation depends on them. Editable later from the same place (a trip settings screen), not just at creation time.
2. **First member**: the creating user is automatically added as the trip's first member with role `admin` and flagged as its **owner** (§15) — trip creation can never produce a trip with zero admins or no owner.
3. **Categories**: the two reserved categories (`accommodation`, `transport`, §10) exist automatically; offer a small set of common, renameable/removable starter categories (e.g. "activity", "meal", "note") for convenience, without preventing the creator from deleting them and defining entirely their own set instead.
4. **Stops**: add stops one at a time through a form covering the same fields the app uses everywhere else — name, category, day (optional — an unscheduled stop is a valid "backlog" item), start/end time or a free-text "not yet defined" label (same split rule as below), place lookup, price, description, planning status (§3), and so on; each stop defaults to `planned` unless the creator explicitly marks it `optional`. There is no separate "setup-only" data-entry surface: this form **is** the same itinerary editor used for every later edit, just applied to a trip that starts empty. Adding a second geolocated `planned` stop on the same day must trigger the same transit-event generation as any other edit (§7) — a trip built entirely through the CMS ends up with travel legs already in place, with no separate backfill step required.
5. **Inviting others**: optional at creation time, and equally available later from trip settings — an `admin` can add members and assign them a role (§15) at any point, not only during initial setup.

**Bulk import (optional, additive)**: alongside the form-based flow above, support seeding a trip from an external spreadsheet (or any structured source) through a stable, documented column-mapping convention, for creators who already have their planning done elsewhere and don't want to re-enter it stop by stop. Key rule worth building in from the start: source spreadsheets commonly mix a structured time with a free-text note in the same cell (e.g. an end time noted as "12:30, departure"). The import must always split this into a pure, calculation-usable end time plus a separate descriptive note — never store them concatenated as in the source. Non-time placeholders (e.g. "evening check-in", "to be confirmed") must be preserved as an explicit "not yet defined" state in a label field, never parsed as if they were real times. Imported stops go through the exact same transit-event generation as stops entered through the CMS form (§7) — bulk import and manual entry are two ways of populating the same underlying data, not two different code paths with different guarantees.

---

## 17. API call budget and caching policy

Every external call this app makes (routing, places, AI, flight data, road-snapping) falls into one of two classes, and they need different cost postures.

**Event-driven calls** — triggered by an actual change: a stop added/edited/reordered/removed, an AI preview (§14), a manual "start now" (§2), a trip built via the CMS or bulk import (§16). These are already bounded by design elsewhere in this document — the per-`(origin, destination, mode)` cache (§6), transit-event regeneration touching only the newly-adjacent legs (§7), AI previews computing travel times only for the stops actually affected (§14) — no additional policy needed beyond what's already specified for each.

**Background/polling calls** — repeat over time regardless of whether anything changed. This is the real cost lever, and needs an explicit rule.

**Rule: background/polling calls are active only while the trip is `"during"` (§4) — pre-trip and post-trip they must be automatically off, not just quiet.** Gate every polling job on the trip's own phase before it evaluates anything else: if `phase` is `"before"` or `"after"`, the job does nothing for that trip — no routing calls, no travel-time monitoring, no position-confirmation tie-breakers — because there is nothing on the ground to monitor outside the trip's own days. This isn't a matter of the checks naturally finding no data to act on (they might well not, most days) — it's an explicit, cheap phase check at the top of the job, so the "nothing found" path never even reaches the point of considering an external call. Turning it back on at the start of `"during"` and back off the moment it becomes `"after"` should require no manual step; it follows automatically from §4's own phase computation, recomputed on every run.

**The one deliberate exception: flight tracking (§12).** Its whole purpose is to track transport *to and from* the trip, so it's expected to look slightly outside `"during"` — an outbound flight is worth tracking the day before departure, while the trip is still technically `"before"`. §12's own scoping (a flight event whose day is "today or tomorrow," trip timezone) already keeps this narrow and self-contained; it is the only polling job allowed to run outside `phase == "during"`, and only for that reason.

**Rule: zero calls when nothing is in scope, not a reduced-frequency heartbeat.** The notification job (§11) still runs on its own cadence (recommended ~5 min), but that run itself is a cheap, database-only check — is any transit leg currently `in_progress`? does any upcoming leg fall inside its lookahead window, below? — and only calls the routing API when that check finds something in scope. During quiet hours, overnight, or any stretch with no active or imminent transit leg, this reduces to exactly zero routing calls for that trip, not a lower-frequency poll.

**Adaptive lookahead for §11 rule 5 (travel-time variation)**: gate checks by the countdown to the leg's planned departure, not a flat cadence applied all day:

| Time to planned departure | Check frequency |
|---|---|
| more than 90 min out | none |
| 30–90 min out | about every 30 min |
| 10–30 min out | about every 10 min |
| under 10 min out, or the leg is already `in_progress` (§11 rules 3–4) | every job run (~5 min) |

The same principle already applies to flight tracking (§12) — scoped to a narrow window (today/tomorrow) at a coarse cadence (~3h) — a working example of this policy already in the document, not something to change.

**Places lookups (opening hours, kitchen closing time, §8; general place details, §14 Flow 1)**: cache per place with a TTL (recommended: a few days to a couple of weeks) rather than re-fetching on every reference — business hours rarely change day to day, and a place referenced repeatedly across previews and edits shouldn't re-trigger a lookup each time.

**AI/LLM calls (§14)**: already purely event-driven — Flows 1–3 fire only on an explicit user action or a delay-triggered re-plan (§11 rule 4), never on a timer. No additional policy needed.

**Position-confirmation call budget (§4)**: the accuracy-aware distance/corridor check itself is always free — client-side geometry against already-cached place/route data. The only paid call it can trigger — a road-snapping tie-breaker for the narrow case of a genuinely ambiguous transit fix (§4) — must be rate-limited independently of the position-reading frequency (recommended: at most once every few minutes per active transit leg), never fired per raw position sample. Most reads resolve for free, either clearly inside or clearly outside the accuracy-adjusted threshold; only the ambiguous minority ever reach this call.

# Part C — Integration wiring and build order

## C1. API key handling

- **Maps client key**: browser-restricted (HTTP referrer), used only for the JS/SDK maps, Places lookups from the client, and any client-triggered routing calls (§6).
- **Maps server key**: unrestricted, used only inside backend jobs (notifications' live re-query, flight tracking) — never sent to the browser.
- **AI provider key** and **flight-data provider key**: server-side only, used exclusively inside the AI assistant function (§14) and the flight-tracking job (§12) respectively.
- **VAPID keys** (push): server-side only, used by the notification job (§11) to sign push payloads.

## C2. Background jobs

| Job | Cadence | Reads | Writes |
|---|---|---|---|
| Notifications | ~5 min | `events`, `user_settings`, `event_travel_baseline` | `notification_log`; pushes via Web Push |
| Flight tracking | ~3 h | `events` where `flight_number` is set and day ∈ {today, tomorrow} | `delay_minutes`, `start_time_label` on the matching event |

Both run as scheduled server-side functions; both are the only holders of the unrestricted server-side API keys above. Per §17, the notifications job's routing-dependent checks (rules 3–5) must first gate on the trip's phase (§4) and do nothing while it isn't `"during"`; flight tracking is the one job allowed to run outside that window, since it's explicitly scoped to track transport at the trip's boundary.

## C3. Realtime wiring

Subscribe each client to `postgres_changes` on `events` (and `categories`, `trip_members`) filtered by `trip_id`. On any remote write not authored by the current session, surface the "Updated by [name]" notice (§15) resolved via `trip_members`.

## C4. Suggested build order

1. **Schema + RLS**: all tables in A3, roles enforced per §15, before any UI.
2. **Auth + trip creation CMS** (§16): sign up/log in/password reset, then the minimum flow to get one trip with one admin/owner and a place to add stops. The trip-list/switcher (A4) falls out of the same schema once auth exists.
3. **Core CRUD + status derivation** (§2, §3, §10): events and categories, with `status_runtime` persisted correctly before anything else depends on it.
4. **Core UI capabilities** (A4) against real data — the live status view, the trip-wide view, the itinerary editor, and search over the trip's own stops — in whatever screen structure was chosen — no travel-time or AI features yet.
5. **Routing integration**: mode determination + estimation (§6), then transit-event generation (§7) and check-in/check-out events, then opening-hours constraints (§8) — build in this order since each layers on the previous one's output.
6. **Calendar export** (§13) and **navigation deep links** (§9) — low-risk, no dependencies beyond step 3.
7. **Push notifications** (§11): install prompt and subscription flow first, then the rule engine and the in-app notification history it feeds, in a background job.
8. **Flight tracking** (§12): additive, independent of everything except step 3's schema.
9. **AI assistant** (§14): the most delicate piece — build last, once every rule it needs to respect (§2, §3, §6, §7, §8) is already correct and stable, since the assistant's whole job is to compute previews using exactly those rules.
10. **Polish + PWA**: install prompts, offline shell, icons, final accessibility pass on category colors (§10).
