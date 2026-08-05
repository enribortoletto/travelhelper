# Claude Code build prompt — implement the app

Master build instruction. You are implementing the collaborative group trip-planning PWA fully described by the documents in this repository — generic, for any trip, not tied to any one destination. Treat everything below as binding.

**Before writing any code**: read `01` and `02` in full, pull the Figma file via the MCP tools listed below (don't skip this — screen structure lives only there), and skim `04` and `05`. Nothing in this file is a substitute for those — it's an index and a conflict-resolution guide, not a summary you can build from on its own.

---

## Sources

Numbered below for reference, not a strict override order — read "When sources conflict" right after this list for how authority actually splits (it's by domain, not by this numbering).

1. **`01-core-logic-and-algorithms.md`** — every business rule, algorithm, default, and edge case. Non-negotiable; nothing else in this repo overrides it.
2. **`02-technical-specification.md`** — stack and data model (Part A), the same rules reproduced verbatim as Part B, integration wiring and build order (Part C). Follow Part C's build order (C4).
3. **The Figma design file** — source of truth for every screen's layout, navigation structure, visual style, and component states/variants. `02` (A4) deliberately leaves screen structure unspecified; the Figma file is where that decision was actually made, by hand, after generation — treat it as authoritative over `03-figma-agent-prompt.md`, which is only the prompt that originally produced it, not the current file.
   - File key: `XhqgtrjffwnzvejSMhd2nV`
   - Page "Design" (all screens): node `2:2`
   - Page "Components" (the atomic library): node `83:84`
   - Pull it with the Figma MCP tools (`get_design_context`, `get_screenshot`, `get_metadata`, `get_variable_defs`) rather than reconstructing it from memory or from `03`.
4. **`04-import-template.xlsx`** — real seed data for the first trip (sheet "Events").
5. **`05-infrastructure-setup.md`** — what to provision and configure, and roughly when, relative to the build order in `02` C4.

## When sources conflict

`01`/`02` win for anything about **data, rules, or behavior** — what gets stored, computed, validated, or enforced. Figma wins for anything about **presentation** — layout, spacing, color, typography, navigation pattern, which screen something lives on. Three specific conflicts exist between the current Figma file and the docs; resolve each exactly this way, don't re-litigate them mid-build:

- **Runtime status renders as 4 visual states in Figma** (`inactive` / `in_progress` / `done` / `skipped`), but §2 defines 3 stored statuses plus a separate, explicitly-not-a-status "past" flag. **Keep the data model exactly as §2 specifies — do not add a 4th stored status.** Render Figma's "done" treatment as the UI's presentation of `inactive` **with** the "past" flag true. This is a display-layer mapping, not a schema change.
- **Category names are inconsistent across the Figma file** — some screens/components show `Stay`/`Transit`, others `Accommodation`/`Transport`, for the same two reserved categories. §10 is unambiguous: the reserved names are exactly `accommodation` and `transport` (the Categories management screen already gets this right, lock icon and all). Use those everywhere, as both the stored value and the default display label; treat any screen still showing `Stay`/`Transit` as needing correction during implementation, not as something to replicate.
- **Trip Card component vs. its actual usage**: the component is defined with variants `active` / `completed` / `planning`, but one screen renders a card labeled `Inactive` — a value belonging to event status (§2), not trip state, and matching none of the three defined variants. Use the component's real three variants, driven by trip phase (§4): `planning` while `"before"`, `active` while `"during"`, `completed` once `"after"`.

Everything else in the Figma file — layout, spacing, styling, navigation, every component's states and variants beyond the three cases above — gets replicated faithfully, not reinterpreted or "improved."

## Data

Seed the first trip from `04-import-template.xlsx`. It's already normalized per stop type — accommodation rows carry check-in windows (§7), food-service rows carry kitchen closing times (§8), activity rows carry opening-hours notes, the two flight rows resolve to Edinburgh Airport as their place (§7, §12) — import it as-is rather than re-deriving any of that from scratch. Two rows were deliberately left out during that file's own preparation (an unused alternative hotel that would have violated §3's "accommodation is always planned" rule, and a bare airport reference with no real schedulable content) — don't re-add them.

## Build order

Follow `02` Part C4: schema + RLS → auth + trip-creation CMS → core CRUD/status derivation → core UI capabilities against real data → routing → transit/check-in/check-out generation → opening-hours constraints → calendar export + navigation deep links → push notifications + in-app history → flight tracking → AI assistant last → polish/PWA. Provision each infrastructure item from `05` at the point in this order it's actually needed, not all up front — most of `05` is organized by service already, but nothing there needs to happen before the feature that depends on it is being built.

## Guardrails carried over from the docs, worth restating here

- No direct client writes to derived events (transit, check-in, check-out) — enforce at the RLS layer, not just in the UI (§7, §15, `05`).
- No AI-driven change writes without an explicit user confirmation of a preview — ever (§14).
- No server-side API key (maps server key, AI provider key, flight-data key, VAPID keys) reachable from client code, under any circumstance (`02` C1).
- Nothing hardcoded to this specific trip's destination, dates, or venues outside of the seeded data itself — the app stays generic (`02` A1).

## Definition of done

- Every rule in `01` / `02` Part B is implemented as written. If something needs to be simplified for a first pass, say so explicitly rather than quietly dropping it.
- Every screen and component in the Figma file has a working equivalent, with the three named conflicts resolved exactly as instructed above and nothing else reinterpreted.
- The trip seeded from `04-import-template.xlsx` is fully browsable and editable through the finished app, including its auto-generated transit and check-in/check-out events.
- Every **[Dashboard]** item in `05` that the current build stage depends on has been called out explicitly as needing the user's action — never silently stubbed around or skipped.
