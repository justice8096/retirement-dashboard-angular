# Dyscalculia Gap Analysis — retirement-dashboard-angular

| Field | Value |
|-------|-------|
| **Project** | retirement-dashboard-angular |
| **Date** | 2026-04-24 |
| **Analyst** | Claude (automated gap analysis) |
| **Framework** | dyscalculia-support-skill/skills/gap-analysis/SKILL.md (8 critical gaps) |
| **Scope** | 6 applicable gaps (skipping K-12-instructional Gap 1 and teacher-prep Gap 4) |
| **Prior work** | Dyscalculia compliance audits 2026-04-19 / -20 / -21 (composite 94/100 A) |

## Summary

The dashboard is already one of the strongest dyscalculia-aware consumer retirement apps I've inspected — a dedicated `DyscalculiaService` centralises currency / percentage / anchor / natural-frequency formatting and is consumed by **32 files / 176 call sites**. Foundational pieces are in place: natural-frequency MC framing ("7 out of 10"), tone-only-amber percentile gradient (red explicitly removed for bad outcomes), calm MC reveal pacer, concrete-tiles CRA visual, whole-dollar defaults, three number-formats (standard / spaced / words), eight context-keyed magnitude anchors, and a voice-entry mode on numeric inputs. Gaps that remain are mostly **breadth** (the strongest features are opt-in and don't activate until the user flips the master toggle) and **anxiety palette creep** (20+ `var(--dark-red)` sites still paint data cells — livability "bad", healthcare q-low, visa-high-income, sankey taxes/deficit, neighborhoods moderate-safety — even though the dedicated MC and guardrails flows now avoid it). No CRITICAL or HIGH findings; 2 MEDIUM, 4 LOW, 3 NICE-TO-HAVE.

## What Exists Today

### Central infrastructure
- `src/app/services/dyscalculia.service.ts` — Angular signal-backed settings store with debounced `localStorage` persistence; 12 settings across numberFormat, roundNumbers, showTextSummaries, percentageDisplay, chartStyle, magnitudeAnchors, numberSpacing, progressStyle, reduceAnimations, mcMode ('full' | 'calm'), voiceEntry.
- `formatCurrency(amount, unit)` — always rounds to whole dollars at dashboard scale; threads numberFormat (standard `$72,000` / spaced `$72 000` / words `about seventy-two thousand dollars per year`).
- `formatCurrencyPrecise(amount, {fractionDigits})` — preserves cents for tax to-the-penny displays while still threading user's format preference.
- `formatPercentage(pct)` — whole-percent for ≥1 % values; sub-1 % keeps one decimal; four display modes (standard / natural `1 in 4` / proportion `about a quarter (25%)` / none `some`).
- `getAnchor(amount, context, yearlySpending?)` — eight contexts (monthly-cost, portfolio, withdrawal-year, percentile, general, magi, fpl-pct, cliff-penalty) returning plain-language calibration strings.
- `naturalFrequency(fraction)` — 0.72 → "7 out of 10".
- `toneForSuccessRate(fraction)` — never returns `danger`; deliberately clamps to `success | warn | neutral`.
- `numberSpacingClass()` — emits `.number-spacing-{normal|wide|grouped}` utility classes with `letter-spacing` rules in `styles.scss`.

### CRA-aligned visuals
- `ConcreteTilesComponent` — renders a dollar amount as an up-to-200 cell grid at $10k/tile, with legend and ARIA label (`FIRE Number: about 37 tiles, each worth $10,000`). Opt-in via `chartStyle: 'concrete'`.
- FIRE Calc step-ladder explanation (`ol.result-explain-steps`) — verbalises `expenses × (100 / withdrawalRate) = FIRE Number` as three plain-language sentences. Strongest inline CRA scaffolding in the app.

### Monte Carlo specifics
- `PERCENTILE_COLORS` uses only the amber/teal/green gradient — a comment at `montecarlo-screen.component.ts:31` documents the explicit removal of red `#E57373` as a Dyscalculia F-002 anxiety fix.
- `calm` mode: `isCalmMc()` gates 8 result cards (success rate → median → p5 → p95 → summary → paths chart → histogram → percentile bars) behind a "Show next →" button with "Skip to full results" escape hatch.
- "What this means" plain-language summary card (step 5) uses natural-frequency phrasing.
- Success-rate card wired to `.success | .warn | .neutral` classes plus ARIA `role="meter"`.

### Input ergonomics
- `NumericInputDirective` (`appNumeric="currency|percent|age|year|rate|fx"`) standardises `step` / `min` / `max` / `inputmode`, injects a voice-entry mic button when `voiceEntry` is on (Web Speech API).
- Digit spacing utility classes applied across 32 files / 176 call sites.

### Anchoring surfaces
MAGI anchor on Assumptions, FPL-pct anchor on Location Compare + Assumptions cliff banner, portfolio anchor on Guardrails + Estate + MC params, withdrawal-year anchor on Roth + Taxes income bar + IRMAA, percentile anchor on the three MC percentile cards. Toggle: `magnitudeAnchors` setting.

### Calm palette primitives
- Dyslexia contrast modes (softer-dark / cream / light) override `--dark-red` to a calmer `#A34846` on the warmer themes.
- `--dark-neutral: #8B9DC3` CSS variable exists as a "replaces red for soft concerns" alternative but is currently only used inside `DyscalculiaSettingsComponent`'s enabled-state pill.

## Gap Assessment (6 applicable gaps)

### Gap 2 — Number Sense Visualization Tools — PARTIAL

| Evidence | Location |
|---|---|
| Concrete tiles subitizing grid | `src/app/components/concrete-tiles/concrete-tiles.component.ts` |
| FIRE-calc part-whole step ladder | `fire-calc-screen.component.ts:72-87` |
| Natural-frequency "7 out of 10" | `dyscalculia.service.ts:266-270` |
| Magnitude anchors (8 contexts) | `dyscalculia.service.ts:182-259` |
| `chartStyle: 'concrete'` wired on `StatCardComponent` | NO — stat-card only uses `magnitudeAnchors` text, never renders tiles |
| Sankey / histogram / paths chart | Rendered as SVGs without a CRA alternative view |

**Gap:** The concrete-tiles component is beautifully built but appears exactly **once in the codebase** (FIRE Calc results). `StatCardComponent` — which powers the dashboard's most prominent headline numbers — never branches on `chartStyle === 'concrete'` even though the user explicitly opted in. Portfolio total, median end balance, FIRE-number-sized figures on every other screen should offer the tile visual. Severity: **MEDIUM** (feature exists, discovery gap).

### Gap 3 — CRA Sequencing — PARTIAL

| Evidence | Location |
|---|---|
| FIRE Calc three-step walkthrough (C → R → A) | `fire-calc-screen.component.ts:72-87` |
| MC calm-mode 8-step reveal | `montecarlo-screen.component.ts:660-672` |
| IRMAA projected-MAGI anchor | `medicare-irmaa-screen.component.ts:295` |
| Other multi-step calcs (Guardrails Corridor, Roth conversion impact, Taxes federal+state stack) | Numbers shown as finished outputs, no step ladder |
| Monte Carlo parameter inputs (regime / return mode / mortality toggle) | All at once, dense param grid |

**Gap:** The FIRE-calc step ladder is the gold-standard CRA pattern in the repo and it's **not replicated** to other multi-step calculations. Taxes screen, for example, shows `Monthly Tax Estimate` → `↳ Federal (annual)` → `↳ State (annual)` as a terse collapsed disclosure; there's no "Here's how we got there: federal = 22 % of $52k above standard deduction; state = 5 % flat; ÷12 for monthly" narration. Same for Roth, Guardrails, Sankey. Severity: **MEDIUM**.

### Gap 5 — Anxiety-Aware Design — MOSTLY GOOD WITH LOCALIZED CREEP

| Calm pattern | Location |
|---|---|
| No red in MC percentile colors | `montecarlo-screen.component.ts:31-40` |
| `toneForSuccessRate` never returns danger | `dyscalculia.service.ts:277-281` |
| Fees exchange-rate fallback uses amber, not red | (prior audit confirmation) |
| Concrete "Show next" pacer + "Skip to full" escape | `montecarlo-screen.component.ts:660-672` |

| Red-paint on data cells still present | File |
|---|---|
| `.cat-score.bad` (livability / inclusion) | `livability-screen.component.ts:150`, `inclusion-screen.component.ts:137` |
| `.q-low` + `.qm-fill.q-low` (healthcare quality) | `healthcare-compare-screen.component.ts:271,322,330,344` |
| `.nbh-safety.moderate` | `neighborhoods-screen.component.ts:288` |
| `.range-max` cost range top-end | `cost-detail.component.ts:137`, `location-detail.component.ts:204` |
| `.pc-item.con` (local-info pros/cons) | `localinfo-screen.component.ts:223` |
| Sankey `.result-value.red` for Taxes + deficit | `sankey-screen.component.ts:254` |
| Guardrails `.s-red` / `.s-floor` | `guardrails-screen.component.ts:232,244,279` |
| Visa `.red` + warning-block | `visa-screen.component.ts:225,247,250` |
| Estate `.param-hint.warn` + `.sw-tax` segment | `estate-screen.component.ts:234,274,280,298` |
| Medicare IRMAA surcharge tier pill | `medicare-irmaa-screen.component.ts:263` |

**Gap:** 11+ screens continue to use `var(--dark-red)` (`#E57373`) for *non-error* data classification — a safety score, a cost-range top, a taxes segment, a "high-income" flag. These are the **exact surfaces retirement anxiety fires on**. The `--dark-neutral` variable exists specifically to replace red for "soft concerns" but sees almost no adoption outside the settings pill. Severity: **MEDIUM** (widespread) but LOW per-screen.

### Gap 6 — Working-Memory Friction — PARTIAL

| Evidence | Location |
|---|---|
| `DyscalculiaSettingsComponent` uses `mat-chip-listbox` with live previews (`$2,470` / `$2 470` / `Two thousand...`) | `dyscalculia-settings.component.ts:43-44, 330-334` |
| FIRE Calc live preview as user types | `[ngModel]` + computed recompute |
| Assumptions "Cash In / AGI / MAGI" stacked disclosure | `assumptions-screen.component.ts:303-325` |
| `help-panel` slide-over drawer | `help-panel.component.ts` |
| **MC parameter grid density** | `montecarlo-screen.component.ts` param grid shows location + start year + years + inflation seed + return mode + regime + ... on a single screen |
| Assumptions screen length | 752 lines of template — 7+ sub-sections rendered simultaneously |

**Gap:** The Monte Carlo *results* have a beautifully paced calm mode — the Monte Carlo *setup* does not. A parameter grid with 10+ inputs violates one-concept-per-screen heuristic. Assumptions-screen ACA regime / MAGI / transition-year-income flow spans 400+ template lines with no progressive disclosure. Severity: **MEDIUM** (tracked as F-008 carry in prior compliance audits).

### Gap 7 — Accessibility Transforms — STRONG

| Evidence | Location |
|---|---|
| Whole-dollar defaults; no 3-decimal noise | `formatCurrency` always `Math.round(amount)` at 62 |
| Optional round-to-nearest-$100 | `roundNumbers: boolean` |
| Three number-format modes | standard / spaced / words |
| Three digit-spacing modes | normal / wide (`0.15em`) / grouped (`0.08em`) |
| Whole-percent ≥1 % + 1-decimal <1 % | `formatPercentage` line 136 |
| Natural frequency for probabilities | `naturalFrequency` |
| `tabular-nums` applied | `stat-card.component.ts:41` |
| Magnitude anchor prefixes ("about $4K/mo", "around a typical starter-home price") | 8 contexts |
| Voice entry on `appNumeric` inputs | `numeric-input.directive.ts` mic button |

**Gap:** Two minor carries:
- F-016 (prior audit): IRMAA bracket table uses `b.partBSurcharge.toFixed(2)` bypassing service — still open per prior audit.
- Leaflet map popups bypass service (accepted architectural limit).

Severity: **LOW**.

### Gap 8 — Sequencing & Procedures — PARTIAL

| Evidence | Location |
|---|---|
| Onboarding is 4-step wizard (Step 3 of 4 — Navigation Preference) | `onboarding.component.ts:31` |
| MC calm reveal walks through 8 result cards | `montecarlo-screen.component.ts:660-672` |
| FIRE Calc step-ladder is a 3-step procedure | `fire-calc-screen.component.ts:74-87` |
| Scenario save → compare → export | `scenarios-screen.component.ts`, report-screen |
| **Guided FIRE-setup → MC → Scenarios flow** | No in-app guidance; user navigates via sidebar |
| Assumptions wizard chunking | Not implemented (tracked F-008) |

**Gap:** The dashboard has many *individual* guided steps but no **end-to-end narrative** for a new user trying to do a "full retirement check". Tracked. Severity: **LOW** (prior MEDIUM flag is being held at MEDIUM).

## Evidence-Base Checklist

| Criterion | Status | Evidence |
|---|---|---|
| Number-line consistency | PASS | `formatCurrency` + `numberSpacingClass` applied uniformly; 176 call sites |
| Magnitude anchoring | PASS | 8 context-keyed anchors live on 8 screens |
| Whole-number defaults | PASS | `Math.round` baked into `formatCurrency`; whole-percent at ≥1 % |
| Calm color palette | MIXED | MC / FIRE / Guardrails: PASS. Livability / Inclusion / Healthcare / Neighborhoods / Sankey / Visa / Estate / Costs / Localinfo / IRMAA: still use `--dark-red` for data cells |
| Breathable number spacing | PASS | 3 settings (normal / wide / grouped) applied everywhere |
| Redundant encoding | MOSTLY PASS | MC success rate = amber bar + number + "7 out of 10 simulated futures" + ARIA meter. Red data cells lack SR equivalent — known dyslexia-audit pattern that requires `.sr-only` backfill |
| Undo affordance | WEAK | Inputs use direct ngModel mutation without snap-back; no slider with "reset to default". Scenarios provide save/revert indirectly |
| Live preview / feedback | PASS | FIRE Calc, MC params, Taxes income-bar, Assumptions MAGI all reactively recompute |
| Words alternative for percentages | PASS | `percentageDisplay: 'none'` mode |
| Natural-frequency probabilities | PASS | `naturalFrequency` used 3 places in MC |
| Inline vs tooltip-only explanation | MOSTLY PASS | FIRE Calc withdrawal-rate hint is **inline**; help-panel is slide-over on-demand for deeper content |

## Prioritized Recommendations

### Must (MEDIUM severity)

**M-1. Replace red data-cell classification with `--dark-neutral` (or calm amber gradient) across non-error surfaces.**
- Files: `livability-screen.component.ts:150,155`, `inclusion-screen.component.ts:137,142`, `healthcare-compare-screen.component.ts:271,322,330,344`, `neighborhoods-screen.component.ts:288`, `cost-detail.component.ts:137`, `location-detail.component.ts:204`, `localinfo-screen.component.ts:223`, `sankey-screen.component.ts:254`, `visa-screen.component.ts:225,247,250`, `estate-screen.component.ts:234,274,280,298`, `medicare-irmaa-screen.component.ts:263`, `guardrails-screen.component.ts:232,244,279`.
- Pattern: reserve `var(--dark-red)` for true error states only (save-msg.error, validation failures). Reuse the MC-proven amber-gradient for "worse" data values. Add `.sr-only` text where color was the sole encoding.
- Effort: **M** (mechanical sweep, ~30 CSS lines + audit).

**M-2. Promote the FIRE-calc step-ladder pattern to other multi-step calcs.**
- Targets: Taxes (federal + state decomposition), Roth conversion impact, Guardrails corridor math, Sankey flow decomposition.
- Pattern: `<ol class="result-explain-steps">` with 3 concrete sentences linking input → transform → output, gated on `dyscalculia.settings().showTextSummaries`.
- Effort: **M** per screen; **L** total (4-5 screens).

**M-3. Wire `chartStyle === 'concrete'` into `StatCardComponent`.**
- File: `src/app/components/stat-card/stat-card.component.ts`.
- Pattern: conditional `<app-concrete-tiles [amount]="rawNumber()" [unitValue]="tileUnitFor(rawNumber())" />` under an `@if` branch.
- Pick `$1k` / `$10k` / `$100k` tile unit based on magnitude so the grid stays readable.
- Effort: **S**.

### Should (LOW severity)

**S-1. Close F-016 — IRMAA bracket table surcharge formatting.**
- File: `medicare-irmaa-screen.component.ts:130-138`. Replace literal `'$' + b.partBSurcharge.toFixed(2)` with `dyscalculia.formatCurrency(b.partBSurcharge, '/mo')` via a `fmtSurcharge()` helper. Effort: **XS**.

**S-2. MC parameter-grid calm mode.**
- File: `montecarlo-screen.component.ts`. Under `dyscalculia.isCalmMc()` collapse the param grid into 3 numbered sections (Who & Where → How & How Long → Risk Rules) with a "Next" button like the result pacer. Effort: **M**.

**S-3. Add undo / snap-back on key inputs.**
- Pattern: restore-to-default chip next to FIRE Calc / MC sliders. When user drags withdrawal rate, a ghost tick marks the previous value and a `Reset ↩` pill appears. Effort: **S** per input; pattern first, rollout second.

**S-4. Redundant SR text for red-classified cells.**
- Even when M-1 lands, keep a `.sr-only` descriptor: `<span class="sr-only">lower than most</span>` so color is never the sole encoding. Effort: **S** bundled with M-1.

### Could (nice-to-have)

**C-1. Anchor `formatCurrency('', { lengthen: true })` to add "about $4K/mo" prefix in `words` mode for quick-scan readers.** Effort: **XS** — add a shorthand branch that maps $72,000 → "about $72K/yr" without going full long-form.

**C-2. Reading-progress indicator for the Assumptions + MC screens.** The dyslexia `.dx-reading-progress` bar is already in `styles.scss:235-247` — letting dyscalculia users re-use it at 1-card-scrolled granularity would reinforce "where am I in this multi-step thing". Effort: **S**.

**C-3. End-to-end "Guided Check-up" tour** — a 5-step sequence (Location → FIRE Setup → MC → Scenarios → Report) stitched into onboarding. Closes Gap 8's narrative cohesion. Effort: **L**.

## Appendix — File references

**Service core**
- `D:/retirement-dashboard-angular/src/app/services/dyscalculia.service.ts`
- `D:/retirement-dashboard-angular/src/app/models/dyscalculia.model.ts`
- `D:/retirement-dashboard-angular/src/app/directives/numeric-input.directive.ts`

**Settings UI**
- `D:/retirement-dashboard-angular/src/app/components/dyscalculia-settings/dyscalculia-settings.component.ts`

**CRA primitives**
- `D:/retirement-dashboard-angular/src/app/components/concrete-tiles/concrete-tiles.component.ts`
- `D:/retirement-dashboard-angular/src/app/components/screens/fire-calc-screen/fire-calc-screen.component.ts` (step-ladder exemplar, lines 72-87)

**Numeric-heavy screens**
- `D:/retirement-dashboard-angular/src/app/components/screens/montecarlo-screen/montecarlo-screen.component.ts`
- `D:/retirement-dashboard-angular/src/app/components/screens/taxes-screen/taxes-screen.component.ts`
- `D:/retirement-dashboard-angular/src/app/components/screens/withdrawal-screen/withdrawal-screen.component.ts`
- `D:/retirement-dashboard-angular/src/app/components/screens/assumptions-screen/assumptions-screen.component.ts`
- `D:/retirement-dashboard-angular/src/app/components/screens/guardrails-screen/guardrails-screen.component.ts`
- `D:/retirement-dashboard-angular/src/app/components/screens/medicare-irmaa-screen/medicare-irmaa-screen.component.ts`
- `D:/retirement-dashboard-angular/src/app/components/screens/estate-screen/estate-screen.component.ts`

**Palette creep (M-1 targets)**
- `D:/retirement-dashboard-angular/src/styles.scss` (--dark-red tokens at 46, 115, 137)
- `D:/retirement-dashboard-angular/src/app/components/screens/livability-screen/livability-screen.component.ts:150,155`
- `D:/retirement-dashboard-angular/src/app/components/screens/inclusion-screen/inclusion-screen.component.ts:137,142`
- `D:/retirement-dashboard-angular/src/app/components/screens/healthcare-compare-screen/healthcare-compare-screen.component.ts:271,322,330,344`
- `D:/retirement-dashboard-angular/src/app/components/screens/neighborhoods-screen/neighborhoods-screen.component.ts:288`
- `D:/retirement-dashboard-angular/src/app/components/screens/cost-detail/cost-detail.component.ts:137`
- `D:/retirement-dashboard-angular/src/app/components/screens/location-detail/location-detail.component.ts:204`
- `D:/retirement-dashboard-angular/src/app/components/screens/sankey-screen/sankey-screen.component.ts:254`
- `D:/retirement-dashboard-angular/src/app/components/screens/visa-screen/visa-screen.component.ts:225,247,250`
- `D:/retirement-dashboard-angular/src/app/components/screens/estate-screen/estate-screen.component.ts:234,274,280,298`
- `D:/retirement-dashboard-angular/src/app/components/screens/localinfo-screen/localinfo-screen.component.ts:223`

**Prior audits (context)**
- `D:/retirement-dashboard-angular/audits/Dyscalculia-Compliance-Audit-retirement-dashboard-angular-2026-04-21.md` (composite 94/100 A)
- `D:/retirement-dashboard-angular/audits/Dyscalculia-Compliance-Audit-retirement-dashboard-angular-2026-04-20.md`
- `D:/retirement-dashboard-angular/audits/Dyscalculia-Compliance-Audit-retirement-dashboard-angular-2026-04-19.md`
