# Figma agent prompt — hi-fi wireframe generation

Prompt to paste into a Figma AI design agent (e.g. Figma Make / Figma's agentic design mode) to generate a high-fidelity wireframe of the app. **Attach `06-core-logic-and-algorithms.md` and `07-technical-specification.md` as context** — the prompt below assumes the agent can read them; it is the only source of truth for what to design. Nothing else should inform the output: no other file in this project, no assumptions about a specific trip, destination, or dates.

---

## Prompt

You are designing a high-fidelity Figma wireframe for a mobile-first, installable web app (PWA): a collaborative group trip planner. Your **only** source of truth for what the app does, what data it holds, and what rules govern it is the two attached files — `06-core-logic-and-algorithms.md` (the domain rules) and `07-technical-specification.md` (stack, data model, and the same rules embedded as its Part B). Do not invent features, screens, or data fields that aren't grounded in those two files. Do not design for any specific real trip, destination, or date — the app is generic, for any group trip.

Work in three ordered phases. Do not start Phase 3 until Phases 1 and 2 are complete and consistent.

### Phase 1 — Variables (design tokens), in valid Tailwind CSS syntax

Before drawing anything, define Figma Variables so that every one of them maps 1:1 to a Tailwind CSS v4 `@theme` token — same names, same scale, no renaming needed for a developer to hand this off. Concretely:

- **Spacing**: a `spacing` collection using Tailwind's default scale (base unit 4px = `spacing-1`; then `spacing-2`=8px, `spacing-3`=12px, `spacing-4`=16px, `spacing-5`=20px, `spacing-6`=24px, `spacing-8`=32px, `spacing-10`=40px, `spacing-12`=48px, `spacing-16`=64px, `spacing-20`=80px, `spacing-24`=96px). Use only these values for every margin, padding, and gap — never an arbitrary pixel value.
- **Radius**: a `radius` collection matching Tailwind's scale — `radius-none`, `radius-sm`, `radius-md`, `radius-lg`, `radius-xl`, `radius-2xl`, `radius-3xl`, `radius-full`.
- **Typography**: a `text` collection matching Tailwind's type scale — `text-xs`, `text-sm`, `text-base`, `text-lg`, `text-xl`, `text-2xl`, `text-3xl`, `text-4xl` — each with its paired default line-height.
- **Color — base palette**: pick one Tailwind default color family (e.g. `slate` or `zinc`) for neutrals, one accent family for primary actions, and one each of a red, an amber, and a green family for the semantic tokens below — every family with its full `50`–`950` shade scale. Name variables `color-{family}-{shade}` exactly (e.g. `color-slate-500`).
- **Color — semantic tokens**: on top of the base palette, define semantic aliases that reference a shade (e.g. `color-primary` → `color-{accent}-600`, `color-danger` → `color-red-600`, `color-warning` → `color-amber-500`, `color-success` → `color-green-600`). Use semantic tokens in components, never a raw palette shade directly.
- **Color — categories**: per §10 of the domain rules, categories are user-defined data with a color each; the two reserved categories are `accommodation` and `transport`. Create a `category` color collection with one variable per example category used in this wireframe (`accommodation`, `transport`, plus 2–3 example user-created ones such as `activity`, `meal`, `note` — pick your own hues, full-saturation, mid-shade e.g. `-600`). For every category's pastel "badge" background, do **not** create a second hand-picked color — use that same category variable at reduced opacity via Tailwind's opacity-modifier syntax (e.g. conceptually `category-accommodation/12`) so light and dark badge tints are always derived, never independently authored, matching the rule that a new category never needs a second manually-tuned color.
- **Status colors**: semantic variables for the three runtime statuses (§2 `inactive`/`in_progress`/`skipped`), the two planning statuses (§3 `planned`/`optional`), and the three position-confirmation states (§4 `confirmed`/`unconfirmed`/`mismatch`) — each a semantic alias onto the base palette, not a new hardcoded hue.
- **Light and dark mode are both mandatory, not optional.** Every color variable (base palette, semantic tokens, category colors, status colors) must be defined as two modes — `light` and `dark` — on the same Figma variable, not as two separate sets of variables and not as a single theme with dark treated as an afterthought. Every component in Phase 2 and every screen in Phase 3 must be verified in both modes before being considered done.

Do not use any fill, stroke, spacing, radius, or text style anywhere in the file that isn't one of these variables.

### Phase 2 — Atomic design system (build once, reuse everywhere)

Organize the component library using atomic design: **atoms** (the smallest indivisible pieces — a single badge, a button, an icon, an input), **molecules** (small groups of atoms functioning together — a stop-list row combining a category badge, a status indicator, and text), and **organisms** (larger, self-contained assemblies — the AI preview card, a full form section, a settings block). Structure Figma's layer/page organization to reflect this hierarchy explicitly, so atoms are never redefined inside a molecule instead of reused from the atom set.

**Every component that can be in more than one state must expose all of those states as variants of the same component — never as separate, similarly-named components, and never as a state left undrawn.** For example, a stop's status card (§2) must be one component with an `inactive`/`in_progress`/`skipped` variant property, all three fully designed — not one card with an "inactive" look improvised by opacity, and not three disconnected components that drift out of sync when one gets edited later. Apply this systematically:

- **Buttons**: default, hover, pressed, disabled — as variants, for each of primary/secondary/destructive.
- **Inputs / form fields**: default, focused, filled, error, disabled.
- **Runtime status indicator**: all three states as variants of one component (§2 — `inactive` / `in_progress` / `skipped`), not three separate components.
- **Planning-status control**: all states as variants (§3 — `planned` selected, `optional` selected, and the disabled/locked appearance used on accommodation stops).
- **Position-confirmation indicator**: all three states as variants (§4 — `confirmed` / `unconfirmed` / `mismatch`).
- **Conflict/alert banner**: variants for each conflict type it must express (§7 check-in window, §8 opening hours, §11 delay-triggered re-plan) and for severity (informational vs. blocking).
- **Category badge**: a single component with a `category` variant property covering every example category from Phase 1, not one hand-copied badge per category.
- **Event/stop list row**: variants for every stop kind named in the source docs (regular stop, accommodation, auto-generated transit event, auto-generated check-in event) crossed with runtime status — not a separate one-off component per combination.
- **Every component above, in both light and dark mode** — a component isn't finished until both modes are built and visibly correct, using the Phase 1 variable modes so switching mode is a variable swap, not a re-draw.

Before laying out any page, build a Figma component (with the variants above as component properties) for each of the following — every one must be assembled only from Phase 1 variables:

- **Category badge/chip** — icon + label + color, per §10, for both the reserved and example user-defined categories.
- **Event/stop list row** — variants for: a regular stop, an accommodation stop, an auto-generated transit event (§7, with a travel-mode icon and live delay indicator), an auto-generated check-in companion event (§7). Each row shows category badge, name, time range, and runtime status (§2).
- **Runtime status indicator** — `inactive` / `in_progress` / `skipped` (§2), visually distinct, reused wherever a stop or event is shown.
- **Planning-status control** — a `planned`/`optional` toggle or segmented control (§3), disabled/hidden for accommodation stops per the rule that accommodation is always `planned`.
- **Position-confirmation indicator** — `confirmed` / `unconfirmed` / `mismatch` (§4), designed so `unconfirmed` reads as neutral, never alarming, and `mismatch` reads as a soft, dismissible signal, not an error state.
- **Conflict/alert banner** — for opening-hours violations (§8), check-in window conflicts (§7), and delay-triggered re-planning prompts (§11 rule 4) — each with a clear, non-blocking call to action, never a silent auto-resolution.
- **AI assistant preview card** — the confirm/cancel surface for §14: shows what changes (old time → new time, stops shifted, transit events regenerated, conflicts flagged), with explicit confirm and discard actions — never an auto-applied state.
- **Map pin** — one visual per category color (§10), plus a distinct treatment for the day's accommodation anchors (§5).
- **Role badge** — `admin` / `editor` / `viewer` (§15).
- **Stop/event edit form fields** — the shared field set from §16 (name, category picker, day, start/end time or a "not yet defined" label, place lookup, price, description, planning status) — build as one reusable form component, since the spec requires the same editor for trip creation and every later edit.
- **Notification preference row** — a toggle per rule from §11, plus quiet-hours and recap-time controls.
- **Primary/secondary buttons, inputs, empty states, and a toast/snackbar** (for the "Updated by [name]" realtime notice, §15) — standard component-library basics, all built from Phase 1 variables.

Every component must actually get reused in Phase 3 — no page should contain a one-off frame duplicating something a component already covers.

### Phase 3 — Screens

The two source files deliberately do **not** prescribe a navigation structure or screen breakdown (see `07-technical-specification.md`, section A4) — that decision is yours. Design whatever set of mobile-first screens and flows most clearly covers every capability below, reusing only the Phase 2 components and only Phase 1 variables. Cover, at minimum:

- A live view of what's happening now/next, with runtime status, position-confirmation, a "start now" action (§2), "mark as delayed," and edit/delete entry points that route into the AI preview (§14) — never a direct edit.
- A trip-wide view: all `planned` stops on a map colored by category, each day's accommodation, and trip-level progress (§4 stops-progress fraction; §7 distance/time traveled so far).
- A full itinerary editor: add/edit/reorder/retime stops through the shared form component, a `planned`/`optional` filter, a surfaced list of AI-proposed `optional` stops that now fit (§3, §14 Flow 1), and inline conflict banners.
- The AI assistant preview/confirm flow itself (§14), for at least one of Flow 1 (add a stop) and Flow 2/3 (delay or manual retime cascading through the rest of the day).
- The trip-creation CMS first-run flow (§16): trip basics, starter categories, adding the first stops, optional member invites.
- Settings: notification preferences (§11), trip basics edit (§1), member/role management restricted to `admin` (§15), category management (§10), and the PWA install prompt.
- At least one empty state (a day with no stops yet) and one conflict state (a stop that no longer fits, per §8 or §7's check-in window) shown in place, not just described.

### Definition of done

- Every color, spacing, radius, and font size used anywhere traces back to a Phase 1 variable — zero hardcoded values.
- Every repeated UI element is an instance of a Phase 2 component — zero duplicated one-off frames.
- Every component with more than one possible state exposes all of them as variants of that one component — zero states left undrawn, zero near-duplicate components standing in for what should be a variant.
- Every component and every screen has been built and checked in both light and dark mode via the Phase 1 variable modes — zero screens or components that only exist in one mode.
- Every screen in Phase 3 is traceable to a specific rule or capability in the two source files — nothing designed that isn't grounded there, and nothing from the source files left uncovered.
