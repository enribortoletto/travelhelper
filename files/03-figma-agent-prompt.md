# Figma agent prompt — hi-fi wireframe generation

Prompt to paste into a Figma AI design agent (e.g. Figma Make / Figma's agentic design mode) to generate a high-fidelity wireframe of the app. **Attach `01-core-logic-and-algorithms.md`, `02-technical-specification.md`, and `04-import-template.xlsx` as context** — the prompt below assumes the agent can read all three. The two markdown files are the only source of truth for what to design (rules, data model, capabilities); nothing else should inform the app's behavior or structure. `04-import-template.xlsx` is a separate, narrower kind of input — see "Placeholder content" below — it supplies realistic sample content for the mockup, not rules.

---

## Prompt

You are designing a high-fidelity Figma wireframe for a mobile-first, installable web app (PWA): a collaborative group trip planner. Your **only** source of truth for what the app does, what data it holds, and what rules govern it is the two attached markdown files — `01-core-logic-and-algorithms.md` (the domain rules) and `02-technical-specification.md` (stack, data model, and the same rules embedded as its Part B). Do not invent features, screens, or data fields that aren't grounded in those two files. The app itself is generic — not built for any one trip — but see "Placeholder content" below for what to actually put inside the mockup.

### Placeholder content — pull it from `04-import-template.xlsx`, don't invent it

A high-fidelity wireframe needs real-looking content, not lorem ipsum or generic labels like "Stop 1" / "Activity name" — but the app being generic (previous paragraph) doesn't mean the *mockup* has to look empty or fake. Resolve this by treating `04-import-template.xlsx` (sheet "Events") purely as a **content source**, separate from the two rule files: every stop name, category, day, time, place, price, and description shown anywhere on the screens (Phase 1) — and every example instance used later while building components (Phase 2) — should be pulled directly from its rows, not invented from scratch. This one populated trip (a real Scotland itinerary) is what makes the wireframe look like a real product instead of a template with placeholders in it; it is not evidence that the app is destination-specific, and nothing about it should leak into Phase 2 or Phase 3 as a hardcoded rule (e.g. don't hardcode "Scotland" into a component, don't assume every trip has a rental car leg).

Specifically:
- Use its `accommodation` rows for the accommodation stops and their check-in windows (§7).
- Use its `transport` rows (flights, car rental) for transit/transport-category content, including the Edinburgh Airport entries as the resolved place for the arrival and departure flights.
- Use its `activity`, `meal`, and `stop` rows for everything else, including the already-differentiated data per type (opening-hours notes on activities, kitchen-closing times on meals, neither on plain waypoint stops) — that differentiation is itself worth reflecting in the wireframe, since it's exactly what §8's opening-hours rule and §7's check-in-window rule look like with real values.
- Reuse rows marked `optional` in the spreadsheet to populate the "AI-proposed optional stops" surface, rather than inventing separate example suggestions.
- If more example content is needed than the sheet provides for a given case, extrapolate in the same style and geography (Scotland, same trip) rather than switching to an unrelated placeholder trip — one coherent example trip throughout the file, not a mix.

Work in three ordered phases, **screens first, then components, then tokens** — the reverse of a typical top-down design-system build. Do not start Phase 2 until Phase 1 gives you a complete, concrete picture of every screen the app needs; do not start Phase 3 until Phase 2's component library is complete and every screen has been rebuilt from it.

### File organization — two Figma pages, nothing built outside them

Create exactly two pages in the Figma file (Figma "pages," the top-level canvases — not to be confused with app screens):

- **"Design WF"** — where Phase 1 lives first (as freehand screens) and ends up living again by the end of Phase 2 (rebuilt from components): every app screen and flow. By the time the file is done, nothing on this page should be anything other than instances of components from "Components."
- **"Components"** — where Phase 2 lives: every atom, molecule, and organism extracted from Phase 1, organized by atomic hierarchy, each as a proper Figma component with its variants. Nothing here is a mockup of an app screen; it's the library itself.

Phase 3's variables aren't tied to either page — they're file-level and available from both.

### Phase 1 — Screens first, freehand but disciplined

Design whatever set of mobile-first screens and flows most clearly covers every capability below, directly on the **"Design WF"** page. The two source files deliberately do **not** prescribe a navigation structure or screen breakdown (see `02-technical-specification.md`, section A4) — that decision is yours. At this stage, **don't wait for a component library or a token set that don't exist yet** — draw real screens with real values (colors, spacing, type sizes, corner radii). The only discipline required at this point: stay informally consistent with Tailwind's default scales as you go (round spacing to 4px multiples, radii to Tailwind's named steps, type sizes to its named scale, colors to a coherent small palette) so that Phase 3 can name what you already used instead of having to redesign it. One mode (pick light or dark) and one representative state per element (e.g. `in_progress`, `planned`) is enough for now — variant coverage and the second color mode are Phase 2's job, not this one's.

Cover, at minimum:

- A live view of what's happening now/next, with runtime status, position-confirmation, a "start now" action (§2), "mark as delayed," and edit/delete entry points that route into the AI preview (§14) — never a direct edit.
- A trip-wide view: all `planned` stops on a map colored by category, each day's accommodation, and trip-level progress (§4 stops-progress fraction; §7 distance/time traveled so far).
- A full itinerary editor: add/edit/reorder/retime stops through a shared stop-editing form, a `planned`/`optional` filter, a surfaced list of AI-proposed `optional` stops that now fit (§3, §14 Flow 1), and inline conflict banners.
- The AI assistant preview/confirm flow itself (§14), for at least one of Flow 1 (add a stop) and Flow 2/3 (delay or manual retime cascading through the rest of the day).
- The trip-creation CMS first-run flow (§16): trip basics, starter categories, adding the first stops, optional member invites.
- Settings: notification preferences (§11), trip basics edit (§1), member/role management restricted to `admin` (§15), category management (§10), and the PWA install prompt.
- At least one empty state (a day with no stops yet) and one conflict state (a stop that no longer fits, per §8 or §7's check-in window) shown in place, not just described.

### Phase 2 — Extract the atomic design system from Phase 1, then rebuild Phase 1 from it

Now go back through every screen on "Design WF" and extract every repeated element into a proper component on the **"Components"** page — this phase produces the design system *from* what Phase 1 actually needed, rather than guessing at it up front. Organize using atomic design: **atoms** (the smallest indivisible pieces — a single badge, a button, an icon, an input), **molecules** (small groups of atoms functioning together — a stop-list row combining a category badge, a status indicator, and text), and **organisms** (larger, self-contained assemblies — the AI preview card, a full form section, a settings block). Structure the frames/sections on "Components" to reflect this hierarchy explicitly, so atoms are never redefined inside a molecule instead of reused from the atom set.

Expect to find at least these — build each as a proper component, then replace every corresponding raw frame back on "Design WF" with an instance of it:

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
- **Primary/secondary buttons, inputs, empty states, and a toast/snackbar** (for the "Updated by [name]" realtime notice, §15) — standard component-library basics.

**This is also where variant and mode completeness gets enforced — Phase 1 only needed to show one state of each; Phase 2 must draw all of them.** Every component that can be in more than one state must expose all of those states as variants of the same component — never as separate, similarly-named components, and never as a state left undrawn. For example, a stop's status card (§2) must be one component with an `inactive`/`in_progress`/`skipped` variant property, all three fully designed — not one card with an "inactive" look improvised by opacity, and not three disconnected components that drift out of sync when one gets edited later. Apply this systematically:

- **Buttons**: default, hover, pressed, disabled — as variants, for each of primary/secondary/destructive.
- **Inputs / form fields**: default, focused, filled, error, disabled.
- **Runtime status indicator**: all three states as variants of one component, not three separate components.
- **Category badge**: a single component with a `category` variant property covering every example category in use, not one hand-copied badge per category.
- **Event/stop list row**: variants for every stop kind named above, crossed with runtime status — not a separate one-off component per combination.
- **Every component above, in both light and dark mode** — a component isn't finished until both modes are built and visibly correct. (This is a placeholder color pass for now — Phase 3 turns these into real variable modes; what matters here is that both modes exist and read correctly.)

By the end of this phase, "Design WF" should contain zero one-off frames duplicating anything now covered by a component.

### Phase 3 — Formalize everything used into variables, in valid Tailwind CSS syntax

Now audit every fill, stroke, spacing, radius, and text style actually used across "Components" and "Design WF," and define Figma Variables so each maps 1:1 to a Tailwind CSS v4 `@theme` token — same names, same scale, no renaming needed for a developer to hand this off. Then go back through every component and every screen and replace every raw value with a reference to the matching variable — the informal Tailwind-scale discipline from Phase 1 should make this a relabeling pass, not a redesign. Concretely:

- **Spacing**: a `spacing` collection using Tailwind's default scale (base unit 4px = `spacing-1`; then `spacing-2`=8px, `spacing-3`=12px, `spacing-4`=16px, `spacing-5`=20px, `spacing-6`=24px, `spacing-8`=32px, `spacing-10`=40px, `spacing-12`=48px, `spacing-16`=64px, `spacing-20`=80px, `spacing-24`=96px).
- **Radius**: a `radius` collection matching Tailwind's scale — `radius-none`, `radius-sm`, `radius-md`, `radius-lg`, `radius-xl`, `radius-2xl`, `radius-3xl`, `radius-full`.
- **Typography**: a `text` collection matching Tailwind's type scale — `text-xs`, `text-sm`, `text-base`, `text-lg`, `text-xl`, `text-2xl`, `text-3xl`, `text-4xl` — each with its paired default line-height.
- **Color — base palette**: pick one Tailwind default color family (e.g. `slate` or `zinc`) for neutrals, one accent family for primary actions, and one each of a red, an amber, and a green family for the semantic tokens below — every family with its full `50`–`950` shade scale. Name variables `color-{family}-{shade}` exactly (e.g. `color-slate-500`).
- **Color — semantic tokens**: on top of the base palette, define semantic aliases that reference a shade (e.g. `color-primary` → `color-{accent}-600`, `color-danger` → `color-red-600`, `color-warning` → `color-amber-500`, `color-success` → `color-green-600`). Use semantic tokens in components, never a raw palette shade directly.
- **Color — categories**: per §10 of the domain rules, categories are user-defined data with a color each; the two reserved categories are `accommodation` and `transport`. Create a `category` color collection with one variable per example category used in the wireframe. For every category's pastel "badge" background, do **not** create a second hand-picked color — use that same category variable at reduced opacity via Tailwind's opacity-modifier syntax (e.g. conceptually `category-accommodation/12`) so light and dark badge tints are always derived, never independently authored, matching the rule that a new category never needs a second manually-tuned color.
- **Status colors**: semantic variables for the three runtime statuses (§2 `inactive`/`in_progress`/`skipped`), the two planning statuses (§3 `planned`/`optional`), and the three position-confirmation states (§4 `confirmed`/`unconfirmed`/`mismatch`) — each a semantic alias onto the base palette, not a new hardcoded hue.
- **Light and dark mode, formalized**: every color variable (base palette, semantic tokens, category colors, status colors) must be defined as two modes — `light` and `dark` — on the same Figma variable, not as two separate sets of variables. This replaces the placeholder light/dark pass from Phase 2 with real variable modes: switching mode should now be a variable swap, not a re-draw.

By the end of this phase, there must be zero fill, stroke, spacing, radius, or text style anywhere in the file that isn't one of these variables.

### Definition of done

- Every color, spacing, radius, and font size used anywhere traces back to a Phase 3 variable — zero hardcoded values remaining, even though Phase 1 started with some.
- Every repeated UI element is an instance of a Phase 2 component — zero duplicated one-off frames.
- Every component with more than one possible state exposes all of them as variants of that one component — zero states left undrawn, zero near-duplicate components standing in for what should be a variant.
- Every component and every screen has been checked in both light and dark mode via the Phase 3 variable modes — zero screens or components that only exist in one mode.
- Every screen is traceable to a specific rule or capability in the two source files — nothing designed that isn't grounded there, and nothing from the source files left uncovered.
- The file has exactly two pages, "Design WF" and "Components," and nothing is built outside them — no component defined for the first time on "Design WF," no screen mockup living on "Components."
