# Acceptance Test — Angular 21 Post-Upgrade QA

**Date started:** 2026-04-20
**Date closed (first pass):** 2026-04-20
**Branch:** `feature/aca-cliff-tax-service-refactor`
**Scope:** Manual verification that the Angular 19→21 upgrade + 2026 law-conformance
rewrite + dev-environment fixes (CORP + CSP + CORS) have not regressed any
user-visible behavior.

**Legend:** `[ ]` = not yet tested · `[P]` = pass · `[F]` = fail (see notes) · `[N/A]` = not applicable

## Session summary (first pass, 2026-04-20)

**Passes:** Location Overview, Location Compare, Items, Income → Taxes,
Roth Conversion Planner, Scenarios, Withdrawal Strategy (superficial).

**Environment fixes landed during QA:**
- API Helmet `Cross-Origin-Resource-Policy` `same-origin` → `same-site`
- Dashboard CSP `connect-src` opened to `localhost:3000` + `data:` font
  source + removed no-op `frame-ancestors`

**Follow-ups opened: 19** (FU-001 through FU-019), grouped below:

| Cluster | FU IDs | Nature |
|---|---|---|
| Dyscalculia sweep — `appNumeric` missing on numeric inputs | FU-002, 004, 007, 008, 011, 013 | Code — one project-wide fix |
| Percentage rounding (2 dp) | FU-005, 009 | Code — shared helper |
| Data completeness across location JSONs | FU-001, 015, 016, 017, 018 | Data + audit script |
| Map / icon / asset bundling | FU-014 | Code — Leaflet defaults |
| External link dead | FU-003 | Content / product decision |
| Currency-conversion UX | FU-010 | Code — hook to selection |
| Monte Carlo "stale results" cue | FU-012 | UX — dirty-state signal |
| Checkbox label overlap | FU-006 | CSS |
| Voice-entry / mic discoverability | FU-019 | UX + coupled to dyscalculia sweep |

**Recommended next step:** Pick up the dyscalculia sweep as a single PR —
it's the biggest cluster (6 findings), shares a root cause, and enables
FU-019 as a side effect.

---

## 0. Environment sanity

- [P] API reachable from dashboard (`/api/locations/all` 200, CORS/CORP/CSP all pass)
- [P] Console free of CSP violations on initial load
- [ ] No zone.js / Angular-21 warnings in console on cold start
- [ ] No 404s on bundled assets (favicon excluded)
- [ ] Dev bypass auth working (or Clerk sign-in if tested)

## 1. Bootstrap & shell

- [ ] Onboarding screen renders when first-run state is detected
- [ ] Header, labeled rail, context bar, status bar all render without layout shift
- [ ] Accessibility panel opens/closes via header control
- [ ] Help drawer (F1) opens on each screen with screen-specific content
- [ ] Shortcut cheatsheet (`?`) opens and closes (Esc)
- [ ] Compact ↔ labeled rail toggle works

## 2. Dyslexia / Dyscalculia accommodations

- [ ] OpenDyslexic font loads when toggled (or falls back cleanly offline)
- [ ] Reading ruler follows mouse when enabled
- [ ] Reading-progress bar tracks scroll when enabled
- [ ] Read-aloud button appears when feature is on; reads visible content
- [ ] Dyscalculia number formatting: grouped digits, consistent decimals
- [F] `appNumeric` directive: step/min/max/inputmode all correct by kind — see **FU-002** (Assumptions screen missing directive on 5+ numeric inputs)
- [ ] Voice-entry mic button appears on currency/percent/rate inputs when opted in
- [ ] Paste handler strips thousands separators

## 3. Location data (read-only paths)

- [ ] `/api/locations/all` populates the selector (160+ entries)
- [ ] `/api/locations/countries` and `/api/locations/regions` populate filters
- [ ] Location detail loads full payload without console errors
- [ ] Neighborhoods / services / medicine / transport supplemental screens render
- [P] Location **Overview**: good; **follow-up** — region names need cleanup (inconsistent labels across locations, see Follow-ups)
- [P] Location **Compare**: side-by-side 2+ locations, all columns populate
- [P] **Items** screen
- [ ] **Housing** screen
- [ ] **Groceries** screen
- [ ] **Transport** screen
- [ ] **Medicine** screen
- [ ] **Vision** screen
- [ ] **Personal Care** screen
- [ ] **Cellphones** screen
- [ ] **Entertainment** screen
- [ ] **Services** screen
- [ ] **Livability** screen
- [ ] **Local Info** screen
- [ ] **Neighborhoods** screen
- [ ] Cost-detail drill-down shows correct currency symbols per location

## 4. Tax + healthcare (2026 law conformance)

- [P] **Income → Taxes** tab (overall walkthrough)
- [ ] Federal tax: 2026 brackets applied (verify MFJ bracket boundaries on taxes-screen)
- [ ] Standard deduction: MFJ 32,200 / single 16,100 / HoH 24,150
- [ ] OBBBA senior deduction: $6,000 applied when age ≥ 65, phases out correctly
- [ ] ACA subsidy: cliff regime default, 2.10–9.96% sliding pct applied under 400% FPL
- [ ] ACA cliff: subsidy drops to $0 at 400%+ FPL (MFJ $86,240 for 2-person)
- [ ] ACA enhanced toggle: 8.5% cap applies when enabled
- [ ] MAGI planning: traditional/Roth mix changes surface the 400% cliff

## 5. Social Security

- [ ] FRA = 67 for 1960+ birth years
- [ ] Early claim (62) reduction = 30% (5/9% for first 36 months)
- [ ] Delayed retirement credit (DRC) = 8%/yr up to age 70
- [ ] Provisional-income thresholds: $25k/$32k single/MFJ
- [ ] 50%/85% taxation tiers applied in tax calc
- [ ] `ssCutYear=2033` haircut option produces 77% benefit when toggled

## 6. Retirement accounts

- [ ] RMD age 73 for 1951–1959, 75 for 1960+
- [ ] RMD excise 25% / 10% if cured
- [P] **Roth Conversion Planner** — tax delta reflects current bracket
- [P] **Withdrawal Strategy** — superficial pass (UI loads, controls wired); deep math verification still pending (proportional / tax-efficient / Roth-last apportionment)
- [ ] Contribution progress tracks toward 2026 limits

## 7. Monte Carlo (projections-screen + montecarlo-screen)

- [ ] Simulation runs to completion (1,000+ paths) without hanging
- [ ] Median / p10 / p90 bands render on chart
- [ ] Success probability displayed; flips sign correctly under stress params
- [ ] Re-runs produce different (but similar-distribution) outputs
- [ ] Inputs → outputs have the expected monotonicity (higher SS → higher success)

## 8. Scenarios + settings

- [P] **Scenarios** — save / load / compare all working
- [ ] Save scenario → appears in list with timestamp (sub-check)
- [ ] Load scenario → restores inputs exactly (sub-check)
- [ ] Scenario compare → highlights deltas (sub-check)
- [ ] Settings persist across reload (localStorage or API, whichever is wired)
- [ ] Fees screen: brokerage + transfer fees round-trip save/load

## 9. Auth-gated paths (requires Clerk sign-in OR dev bypass)

- [ ] `/api/me` profile fetch + update
- [ ] `/api/me/household` round-trip
- [ ] `/api/me/financial` round-trip
- [ ] `/api/me/withdrawal` round-trip
- [ ] `/api/me/scenarios` CRUD
- [ ] `/api/me/fees` round-trip
- [ ] Billing status displays correct tier
- [ ] Custom-locations CRUD (if on a tier that allows it)

## 10. Regression watch (Angular 21 suspects)

- [ ] No `@HostListener` arg-mismatch errors at runtime (app.component.ts already patched)
- [ ] Signals-based change detection: no stale values on rapid input changes
- [ ] Material dialogs / tooltips / menus render with correct z-index
- [ ] Route transitions don't drop state
- [ ] HMR doesn't leak duplicate components

---

## Failures & follow-ups

_Log each `[F]` here with screen, steps, console output, and suspected fix._

### FU-014 — Neighborhoods map marker icon 404
- **Screen:** Community → Neighborhoods (Leaflet map)
- **Symptom:** Default marker pin icon fails to load ("marker icon broken
  / not found").
- **Root cause (likely):** The well-known Leaflet + bundler issue —
  `L.Icon.Default` references `marker-icon.png` / `marker-shadow.png` /
  `marker-icon-2x.png` at relative URLs that the bundler doesn't preserve.
  Browser requests hit the app origin at e.g. `/marker-icon.png` → 404.
- **Fix direction:** Either
  1. Re-point `L.Icon.Default.prototype.options` to explicit imports (via
     `new URL(..., import.meta.url)` or Angular `assets/` copies) — the
     common Leaflet-Angular snippet.
  2. Define a project marker icon (inline SVG) and drop the Leaflet
     defaults entirely.
- **Verify:** Search for `L.Icon.Default|markerIcon` in the map-component
  file to confirm the root cause.

### FU-021 — Assumptions Save: "feedingMode is only supported for dogs and cats"
- **Screen:** Assumptions → Pets → Save
- **Symptom:** API rejects the payload when any non-dog / non-cat pet
  (bird, rabbit, fish, horse, reptile) carries a `feedingMode` value.
  The validator's intent is correct — feedingMode's commercial/raw/home
  categories only meaningfully apply to dogs and cats — but the
  dashboard round-trips the field regardless of type.
- **Affected pet types:** bird, rabbit, fish, horse, reptile (anything
  other than dog / cat)
- **Fix direction:** In the Assumptions save payload, strip or null
  `feedingMode` unless `pet.type` is `'dog'` or `'cat'`. Matches the
  API contract without needing a backend change.
  - Location: [assumptions-screen.component.ts:694](src/app/components/screens/assumptions-screen/assumptions-screen.component.ts:694)
    in the `save()` payload construction — pets.map should set
    `feedingMode: (p.type === 'dog' || p.type === 'cat') ? p.feedingMode : null`.
- **Consider also:** hiding the Feeding Mode input row in the UI unless
  the current pet's type is dog or cat, so users don't set a value that
  will be silently stripped.
- **Related:** FU-002 / FU-019 cluster (same screen), but this is a
  validation mismatch, not a dyscalculia issue — independent fix.

### FU-020 — Accessibility panel: font color unreadable on light background
- **Screen:** Accessibility settings panel
- **Symptom:** On a light-theme background the panel's text/labels stay a
  light tone, yielding very low contrast against the light bg — barely
  readable. When the global theme switches to light, the panel's typography
  doesn't follow.
- **Likely cause:** Hardcoded `color: var(--dark-text)` / light-on-dark
  color tokens inside the panel's component styles rather than
  theme-aware tokens (e.g. `--panel-text` that resolves per theme).
- **Fix direction:** Audit `accessibility-panel` + `dyscalculia-settings`
  + `dyslexia-settings` CSS for direct references to `--dark-text*`,
  `--dark-bg*`, and hex-coded light colors; replace with semantic tokens
  that flip with the theme, or gate the dark-theme values behind
  `[data-theme="dark"]` selectors so light-theme falls back to dark
  text. Verify all labels / section headings / hint text at AA contrast
  (≥ 4.5:1 for body, ≥ 3:1 for large text) under both themes.
- **Scope note:** If this pattern affects other panels/drawers, roll
  into a broader "theme-aware token audit" — the fix there is structural
  (token renaming), not file-by-file.

### FU-019 — Microphone / voice-entry affordance nowhere visible
- **Scope:** Whole app (Accessibility feature F-008 — Dyscalculia)
- **Symptom:** User cannot find the mic button anywhere.
- **Root cause (multi-part):**
  1. The mic button only attaches via the `NumericInputDirective`
     ([numeric-input.directive.ts:92-94](src/app/directives/numeric-input.directive.ts:92)),
     which requires the input to carry `appNumeric="currency|rate|percent"`.
     Because many numeric inputs still use raw `<input type="number">`
     (FU-002, 004, 007, 011, 013), the directive never runs there → no
     mic button.
  2. The directive also requires `dyscalculia.isEnabled()` **and**
     `dyscalculia.settings().voiceEntry === true`. Confirm both are
     reachable from the Accessibility panel UI — if `voiceEntry` isn't
     toggleable from the panel, users can't opt in even on fields that
     have the directive.
  3. SpeechRecognition must be supported — Firefox desktop has no
     support. Confirm the test browser is Chrome/Edge/Safari.
- **Fix direction:**
  - Finish the dyscalculia sweep (FU-002/004/007/011/013) so `appNumeric`
    actually covers the numeric UI.
  - Verify / add a `voiceEntry` toggle in the Accessibility panel.
  - Add a panel hint when SpeechRecognition is unavailable
    ("Voice entry requires Chrome, Edge, or Safari").
- **Also consider:** Even after the directive runs, the mic button is
  inline-styled and small (24 × 28 px). If voice-entry is a marquee
  accessibility feature, it may deserve a more discoverable affordance
  — e.g. a persistent "Voice input: On" indicator in the status bar.

### FU-018 — Local Info: Resources/Links and Climate not populated
**Status update (2026-04-20):** Root cause found for Climate — the UI
template was reading the legacy `ClimateInfo.type` + `avgTemp` shape
but actual location data uses the current `{winterLowF, summerHighF,
rainyDaysPerYear, meetsWarmWinterReq}` shape. Template updated to
render both shapes so 100% of locations now show climate info. Added
explicit "No climate data yet" fallback when `climate` is absent.

Resources/Links card now shows a friendly "No community resources
contributed for this location yet" when either the supplement is
missing or all link groups inside it are empty — eliminates the card
being blank with no explanation.

Contribution-pipeline follow-up remains for the 137 locations missing
`local-info.json` supplements entirely.
- **Screen:** Community → Local Info
- **Symptom:**
  - **Resources and Links** — not populated for all tabs (partial data,
    inconsistent across locations).
  - **Climate** — not populated at all (empty on every location checked).
- **Fix direction:** Roll into the **FU-015/016/017** data-completeness
  audit — extend the proposed `tools/audit-location-data-completeness.mjs`
  to cover `resources`, `links`, and `climate` fields.
- **Note on Climate:** If `climate` is *never* populated anywhere, that
  suggests the data source / contribution flow for that field was never
  wired up. Needs a separate decision: do we pull from NOAA / NOAA-style
  open APIs at build time, or require manual contributions? Flag as a
  source-of-truth question, not just a data gap.

### FU-017 — Livability Index: empty tabs on some locations
**Status update (2026-04-20):** Data audit complete (see
[retirement-api/audits/location-data-gaps-2026-04-20.md](../../retirement-api/audits/location-data-gaps-2026-04-20.md)).
**21 / 158** locations have an `inclusion.json`; the rest fall through
to the existing lifestyle-ratings fallback card, which works. Where the
file exists but specific tabs are empty (e.g. Lisbon/Algarve), that's a
data-content gap inside the JSON. Treat this as a contribution-pipeline
task, not a code bug.
- **Screen:** Community → Livability Index
- **Symptom:** One or more tabs render no content on some locations.
  - Confirmed: Lisbon / Algarve, Portugal
  - Likely others — similar pattern to FU-015 / FU-016.
- **Fix direction:** Bundle with **FU-015** and **FU-016** as one
  **data-completeness audit** covering:
  - `neighborhoods`
  - `services` (all sub-categories)
  - `livability` (all tabs)
- **Proposed script:** `tools/audit-location-data-completeness.mjs` —
  walk every `data/locations/*/*.json`, check each expected field, emit
  a markdown report `audits/location-data-gaps-<date>.md` with a row
  per (location, missing field) pair. Then either populate via the
  contribution pipeline or render a shared friendly empty state.

### FU-016 — Local Services: only Healthcare and Connectivity populated
**Status update (2026-04-20):** Not a render bug — services-screen
iterates whatever `categoryId`s are present in the location's
`services.services[]`. The location the user opened simply had entries
in only two categories. Across all 158 locations, 137 have at least
some services data; per-category coverage varies and is a
data-completeness task. Full breakdown in
[retirement-api/audits/location-data-gaps-2026-04-20.md](../../retirement-api/audits/location-data-gaps-2026-04-20.md)
under "Service categories".
- **Screen:** Community → Local Services
- **Symptom:** All other service categories (e.g. utilities, household,
  banking, transit, government, etc.) render empty even where the
  location has data or those categories existed on older versions.
- **Possible causes:**
  1. Data gap — the other category arrays are empty/missing in the
     location JSONs.
  2. Render bug — the component only iterates over two hardcoded
     categories instead of the full taxonomy.
  3. API filtering — the supplemental endpoint
     (`/api/locations/:id/services`) may be collapsing to a subset.
- **Fix direction:** Inspect [services-screen component](src/app/components/screens/services-screen/)
  first — if the iteration is hardcoded, that's a quick fix. If the
  categories are simply empty in the JSONs, bundle with FU-015 as a
  broader data-completeness audit.

### FU-015 — Missing neighborhood data for specific locations
**Status update (2026-04-20):** Data audit complete. Only **21 / 158**
locations have a `neighborhoods.json` supplement. The remaining 137
fall through to the existing "Detailed neighborhood data not available
for this location." fallback inside [neighborhoods-screen](../src/app/components/screens/neighborhoods-screen/neighborhoods-screen.component.ts),
which is the correct graceful empty state. Gap is pure data-authoring,
tracked in [retirement-api/audits/location-data-gaps-2026-04-20.md](../../retirement-api/audits/location-data-gaps-2026-04-20.md).
- **Screen:** Community → Neighborhoods
- **Symptom:** Several locations render an empty / no-data state:
  - Gainesville, VA
  - Glen Burnie, MD
  - (likely more — this is a data-completeness scan, not a render bug)
- **Fix direction:** Data problem, not code. Audit all 160+ location JSONs
  for the `neighborhoods` array and either
  1. Populate via the contribution pipeline (preferred — crowd-sourced).
  2. Stub with a friendly empty state ("No neighborhood data yet for
     <location>. [Contribute →]") so the UI doesn't look broken.
- **Scope:** Run a one-off script that greps for missing / empty
  `neighborhoods` in `data/locations/*/*.json` and produce a TODO list.

### FU-013 — FIRE Calculator not dyscalculia-compliant
- **Screen:** FIRE Calculator
- **Fields:** Current Savings, Annual Savings, Annual Expenses
- **Fix direction:** Same as FU-002 / FU-004 / FU-007 — add
  `appNumeric="currency"`. Roll into the project-wide sweep.

### FU-012 — Monte Carlo: no "stale results" cue after editing lower-tab inputs
- **Screen:** Simulate → Monte Carlo
- **Symptom:** Changing inputs in the nested lower tabs silently invalidates
  the displayed results. Nothing tells the user they need to hit
  **Run Simulation** to refresh — the chart keeps showing pre-edit numbers
  as if they still reflect the current state.
- **Fix direction (pick one or combine):**
  1. **Dirty banner** above the chart: "Inputs changed — results are from
     <timestamp>. Rerun to refresh." Dismisses on next successful run.
  2. **Faded / watermarked chart** when results are out of date (apply a
     `stale` CSS class that reduces opacity + overlays a "Stale" pill).
  3. **Pulse / glow on the Run Simulation button** when any simulation
     input has changed since the last completed run.
  4. **Auto-rerun with debounce** (200–400 ms after last change) — only
     viable if a single MC run is cheap enough (~<1 s). Probably too
     slow here; prefer (1)+(3).
- **Implementation:** Track a `simDirty` signal that sets to `true` on any
  input change and to `false` on run completion. Bind the banner / button
  glow / overlay to it.

### FU-011 — Currency-conversion calculator: "Amount to Transfer" field non-compliant
- **Screen:** Income → Fees and Currency → conversion calculator
- **Field:** Amount to Transfer
- **Reported as:** "not dyslexia compliant" — interpreting as **dyscalculia**
  compliance since it's a numeric input (dyslexia covers reading/typography
  accommodations, not number formatting). Confirm with user if dyslexia
  was intended.
- **Fix direction:** Bundle with FU-002 / FU-004 / FU-007 / FU-008 —
  add `appNumeric="currency"` and apply thousand-separator formatting
  consistent with the rest of the sweep.

### FU-010 — Fees & Currency tab doesn't surface selected locations' currencies
- **Screen:** Income → Fees and Currency
- **Symptom:** User had an EU location selected in their comparison set, but
  EUR was not shown in the currency-conversion section. Tab appears to
  render only a fixed/default currency rather than deriving the list from
  the currently selected / compared locations.
- **Expected:** The conversion panel should display at minimum every
  distinct `currency` field across the user's selected locations (e.g.
  USD + EUR when a Portugal or France location is in view).
- **Fix direction:** Feed the currency list from the `LocationService`
  selection signal (or the compare-set), dedupe, and render one row per
  currency. Fall back to USD-only when no non-USD locations are selected.

### FU-009 — Projections allocation percentage needs 2 dp rounding
- **Screen:** Income → Projections → Allocation
- **Symptom:** Percentage displays with >2 decimal places (likely raw
  division residue).
- **Fix direction:** Same pattern as FU-005 — round to 2 dp on display
  and on persist; renormalize the residual so the allocation still sums
  to 100.00 after rounding.
- **Bundle with:** FU-005. Search for any allocation-render helper used
  by both Asset Allocation and Projections Allocation so one fix covers
  both screens.

### FU-008 — PIA field missing thousand-separators (Income → Social Security)
- **Screen:** Income → Social Security tab
- **Field:** PIA (Primary Insurance Amount, monthly)
- **Symptom:** Displayed as raw digits (e.g. `3200` instead of `3,200`).
- **Constraint:** `<input type="number">` cannot show thousand-separators
  natively — comma triggers input validation failure.
- **Fix direction:** Either
  1. Switch to `<input type="text" inputmode="decimal">` with a
     format-on-blur / parse-on-input pair (the `appNumeric` paste handler
     already strips commas, so input parsing is straightforward).
  2. Keep `type="number"` and render a **read-only formatted echo** below
     the input (e.g. "= $3,200/mo"). Lower effort, preserves spinner + HTML
     validation.
- **Bundle with:** FU-002/004/007 dyscalculia sweep — this is the same
  underlying ask (consistent grouped-digit formatting across numeric UI).

### FU-007 — FIRE Setup not dyscalculia-compliant
- **Screen:** FIRE Setup
- **Fields:** Annual Savings, Annual Expense
- **Fix direction:** Same as FU-002/FU-004 — add `appNumeric="currency"`.
- **Note:** FU-002, FU-004, and FU-007 share a root cause (raw `type="number"`
  bypassing the directive). When fixing, do a **project-wide sweep** rather
  than one screen at a time — audit every screen's numeric inputs and add
  the directive. Consider lint rule `no-raw-numeric-input` or a
  `@Directive({ selector: 'input[type=number]:not([appNumeric])' })` that
  warns at runtime during dev.

### FU-004 — Portfolio / Account Balances not dyscalculia-compliant
- **Screen:** Assumptions → Portfolio section
- **Symptom:** Same bypass of `appNumeric` as FU-002 —
  - Portfolio **Total Balance** field
  - **All** Balance inputs under "Account Balances"
- **Fix direction:** Add `appNumeric="currency"` to each. Also apply the
  dyscalculia spacing class on the read-only "Total Balance" display so
  grouping is consistent with the input formatting.

### FU-005 — Equity (Asset Allocation) rounding
- **Screen:** Assumptions → Asset Allocation
- **Symptom:** The Equity field displays with more than 2 decimal places
  (likely `toFixed`-free output, or division residue).
- **Fix direction:** Round to 2 dp on display and on persist; ensure the
  underlying allocation still sums to 100.00 after rounding (renormalize
  the residual to Bonds or the last bucket).

### FU-006 — Checkbox labels obscured when selected
- **Screen:** Assumptions
- **Affected controls:**
  - FX Drift
  - Social Security Cut
- **Symptom:** When checked, the rendered check/overlay covers the label
  text.
- **Fix direction:** CSS — likely a custom-styled checkbox with
  `position: absolute` on the checked-state glyph that overlaps the `<label>`.
  Inspect the selector producing the overlay and either reduce its size,
  adjust its offset, or give the label `position: relative; z-index: 1`.

### FU-002 — Assumptions-screen numeric fields not dyscalculia-compliant
- **Screen:** Assumptions
- **Symptom:** "0 stuck before it" on several numeric inputs — when the field
  holds a value (e.g. default birth year for a new child), typing a new number
  leaves a leading `0` in the display. Arrow up/down clears it.
- **Affected fields (confirmed):**
  - Birth Year (new household member / child)
  - Total Annual Need
  - Cash In
  - Social Security ($/yr)
  - Target Annual Income ($)
- **Root cause:** These `<input type="number">` controls are raw Angular
  ngModel bindings with no `appNumeric` directive applied
  ([assumptions-screen.component.ts:47-50, 110](src/app/components/screens/assumptions-screen/assumptions-screen.component.ts:47)).
  They bypass:
  - `appNumeric` step/min/max/inputmode normalization
  - the paste-handler that strips thousands separators
  - dyscalculia spacing classes on format output
- **Fix direction:** Add `appNumeric="currency"` (or `year` for Birth Year) to
  each affected input and remove inline `min`/`max`/`step` that the directive
  supplies. Sweep the whole Assumptions screen for consistency, not just the
  five fields above, since the pattern will repeat.
- **Related audit:** Dyscalculia-Compliance-Audit-retirement-dashboard-angular-2026-04-20.md

### FU-003 — "Get a real quote" external link broken
- **Screen:** Assumptions (healthcare section)
- **Symptom:** The "Get a real quote →" affordance is valued, but the target
  external site is broken (404 / dead domain).
- **Fix direction:** Two options —
  1. Replace with a current live resource (e.g. healthcare.gov plan-finder
     with pre-filled ZIP + household size query params).
  2. Remove the link and surface the text as an in-app tip pointing users to
     the healthcare-exchange for their state.
- **Location:** [assumptions-screen.component.ts:427](src/app/components/screens/assumptions-screen/assumptions-screen.component.ts:427)

### FU-001 — Region name normalization (Location Overview)
**Status update (2026-04-20):** Audit complete. **34 distinct region
strings** across 158 locations (see
[retirement-api/audits/location-data-gaps-2026-04-20.md](../../retirement-api/audits/location-data-gaps-2026-04-20.md)
region table). Proposed taxonomy: **`region`** = macro region
(continent or US-level — "US Southeast", "Southern Europe", "Central
America"), **`subregion`** = state/province/department — would need
a new optional field + a one-off migration script, deferred pending
product decision. Audit report + script remain in tree so future
decisions can re-run `node tools/audit-location-data-completeness.mjs`
to see current state.
- **Screen:** Location Overview
- **Symptom:** Region labels are inconsistent across location JSONs — mix of
  continent-level ("Southern Europe"), country-subdivision ("Virginia",
  "Maryland", "Occitanie"), and hybrid ("US Southeast", "Central America").
- **Impact:** Cosmetic; filters and compare-by-region still work, but the
  display is visually uneven.
- **Fix direction:** Decide on a taxonomy (e.g. `region` = macro-region,
  `subregion` = state/province) and normalize the 160+ location JSONs. Likely
  needs a migration script in `tools/` mirroring the `strip-stale-federal-brackets.mjs`
  pattern.

---

## Sign-off

- [ ] All items above either `[P]` or explicitly `[N/A]` with rationale
- [ ] Failures either fixed or logged in `audits/` as a separate finding
- [ ] Ready to close Todo #5 (Angular 21 manual QA)
