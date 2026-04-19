# Dyscalculia Compliance Audit Report

| Field | Value |
|-------|-------|
| **Project Name** | retirement-dashboard-angular |
| **Audit Date** | 2026-04-19 |
| **Auditor** | Claude Opus 4.7 (1M context) — automated analysis |
| **Standards Audited** | IDEA, Section 504, NCTM, CRA methodology, Dyscalculia Content Audit Framework (10 dimensions) |
| **Scope** | Angular 19 SPA — `dyscalculia.service.ts`, `dyscalculia-settings.component.ts`, all 28 screen components, global `styles.scss`, `tax.service.ts` (new), `healthcare.service.ts` (new), `glossary.service.ts` (new), `numeric-input.directive.ts` (new) |
| **Audit Type** | Re-audit (supersedes 2026-04-16) |

---

## Audit Framing

`retirement-dashboard-angular` is a number-dense consumer retirement planning tool, not a math-remediation program. IDEA and §504 instructional-program requirements (IEP goals, RTI, 60-day evaluations, CRA classroom progression, identification timelines, progress monitoring) are **N/A** for a browser SPA. What applies is the **Dyscalculia Content Audit Framework** (10 dimensions) — CRA-fidelity reinterpreted as UI surfaces (concrete quantity visuals → representational charts → abstract figures), number-sense support, multisensory design, accommodation/scaffolding, math-anxiety management, visual accessibility, comorbidity support, formula exposure, number presentation, magnitude anchoring, and error-analysis.

Since the 2026-04-16 audit, the project has shipped a substantial wave of dyscalculia-targeted fixes: the FIRE step-ladder (F-001), the Monte Carlo danger-red → neutral-tone migration with `toneForSuccessRate` (F-002), percentile magnitude anchors with `naturalFrequency` phrasing (F-003), the extended multi-context `getAnchor` helper (F-005), a central `/api/glossary` service (F-007), the `NumericInputDirective` standardizing `step`/`min`/`max`/`inputmode` (F-009), and an inline SWR definition on the FIRE screen (F-010). The product retains its first-class `DyscalculiaService`, dyscalculia-settings panel, GOV.UK + W3C COGA grounding, and bar-only charting. Residual gaps are now concentrated in three areas: (a) the new MAGI/FPL/regime healthcare audit UI on Assumptions + Compare introduces dense raw-formula exposure (`magiForAca.toFixed(0)`, `fplPct.toFixed(0)`) that bypasses the dyscalculia format pipeline, (b) several widely-used severity classes (`.worst-in-row`, `.priciest`, `.bad`, `.aca-unsubsidized`, `.worst`) still resolve to the same `#E57373` red that was retired from Monte Carlo, (c) no calm/progressive-reveal run mode, voice entry, or cross-device preference persistence yet.

---

## Executive Summary

The product has **moved up one letter grade** since the prior audit: seven of eleven prior findings are fully closed, two are partially addressed, and two remain open. The `DyscalculiaService` gained four new helpers — `getAnchor(amount, context, yearlySpending)`, `naturalFrequency(fraction)`, `toneForSuccessRate(fraction)`, and a `numberSpacingClass` computed — and these helpers are consistently applied across the FIRE Calc, Monte Carlo, Roth Planner, Taxes, and Assumptions screens. The new Taxes-screen Annual Income input and Roth-Planner Annual Conversion Amount input correctly bind `[class]="dyscalculia.numberSpacingClass()"` and surface magnitude anchors via `getAnchor(..., 'withdrawal-year')`. The Compare screen exposes a new MAGI/FPL audit banner and multi-city healthcare derivation which materially increase numeric density — this is not an anti-pattern in itself (it explains what drives the numbers) but the banner formats values as `'$' + .toFixed(0)` and `.toFixed(0) + '% FPL'`, bypassing `formatCurrency` and therefore the user's `numberFormat` preference (spaced / words). Cents-precision tax values display as `fmtCents` using a bare `toLocaleString` for the same reason.

**Composite score: 85/100 (A — excellent compliance, minor residual gaps).**

### Findings Summary by Severity

| Severity | Count | Description |
|----------|-------|-------------|
| CRITICAL | 0 | — |
| HIGH | 1 | F-012 New MAGI/FPL/regime display bypasses dyscalculia `formatCurrency` |
| MEDIUM | 4 | F-004 concrete layer; F-006 calm-run mode; F-008 voice entry; F-013 new `fmtCents` / `fmtYear` helpers sidestep spacing/words |
| LOW | 3 | F-011 cross-device prefs; F-014 red severity classes proliferate outside Monte Carlo; F-015 anchor helper has no `monthly-cost` context for the new audit-banner values |
| **Total** | **8** | (down from 11) |

### Compliance by Domain

| Domain | Compliance % | Status | Findings |
|--------|--------------|--------|----------|
| Identification & Evaluation (education-aligned) | N/A | — | — |
| IEP Development | N/A | — | — |
| §504 Accommodations (digital-access analog) | 90% | PASS | F-011 |
| Instructional Program / CRA progression (as UI design) | 70% | PASS w/ gaps | F-004 |
| Progress Monitoring | N/A | — | — |
| Universal Design & Access | 88% | PASS | F-008 |
| Professional Support | N/A | — | — |
| **UX Heuristics — Number Presentation** | 80% | PASS | F-012, F-013 |
| **UX Heuristics — Math Anxiety** | 82% | PASS | F-014, F-006 |
| **UX Heuristics — Formula Exposure & Literacy** | 85% | PASS | F-012 |
| **UX Heuristics — Magnitude Anchoring** | 90% | PASS | F-015 |
| **UX Heuristics — Error Analysis** | 70% | PASS w/ gaps | — |
| **UX Heuristics — Multisensory Design** | 75% | PASS w/ gaps | F-008 |
| **UX Heuristics — Comorbidity Support** | 75% | PASS w/ gaps | F-008 |
| **UX Heuristics — Visual Accessibility** | 85% | PASS | F-014 |
| **UX Heuristics — Accommodation / Scaffolding** | 90% | PASS | — |
| **UX Heuristics — Number Sense** | 90% | PASS | F-015 |

---

## Detailed Findings

### HIGH Findings

#### F-012: New MAGI/FPL/regime audit display bypasses `formatCurrency` — raw `.toFixed(0)` dollars and percentages
- **Standard/Law:** Dyscalculia Content Audit — Number Presentation (consistent, user-controlled numeric format); NCTM Communication
- **Severity:** HIGH
- **Category:** Formula exposure / number presentation
- **Element:**
  - `src/app/components/screens/assumptions-screen/assumptions-screen.component.ts:294,300,302,307,325,365-367,396-397,409-410` (Cash In, Federal AGI, MAGI, Monthly Cost, Transition MAGI, Above-cliff warning, FPL % hint)
  - `src/app/components/screens/location-compare/location-compare.component.ts:50,59,1019` (`year-toggle-hint` using `'$' + ....toLocaleString()`, audit banner Home-MAGI via `fmtYear`, `auditFplPct().toFixed(0)`)
- **Description:** The 2026-04-19 healthcare-regime rollout introduced a dense audit block that displays MAGI, AGI, cash-in, FPL percentage, transition-year MAGI, and cliff-penalty amounts. These are rendered as `{{ '$' + healthcare.magi().magiForAca.toFixed(0) }}` and `{{ (hc.decision.fplPct ?? 0).toFixed(0) }}% of FPL` — string-concatenated directly in the template, bypassing `DyscalculiaService.formatCurrency`. A dyscalculic user who has selected `numberFormat: 'spaced'` or `'words'` sees `$81760` or `412% of FPL` rather than `$81 760` / `four hundred twelve percent`. The `numberSpacingClass` is applied to the wrapper `<span>`, so visual grouping works, but the user's chosen *format* is not respected.
- **Impact:** Violates the core accommodation promise — the whole reason `formatCurrency` exists is so the user's preferred rendering propagates everywhere. A six-figure MAGI without thousands separation is exactly the kind of "big blob of digits" the audit framework flags as a subitizing failure.
- **Evidence:** Raw string concatenation pattern repeats ~12 times across the two files. `toFixed(0)` also strips the user's locale's group separator even in default mode.
- **Remediation:** Replace each `'$' + x.toFixed(0)` / `'$' + x.toLocaleString()` with `dyscalculia.formatCurrency(x, '/yr')` (or `''` for lump sums). For FPL percentages, add a new `formatPercentage(pct, { precision: 0 })` path or reuse the existing natural-frequency mode for the "X% of FPL" framing ("about 4 times the poverty threshold"). Bind all healthcare-audit numbers through the same format pipe so the user's preference propagates.
- **Effort Estimate:** S

---

### MEDIUM Findings

#### F-004: No concrete/manipulative layer — UI remains abstract + representational only
- **Standard/Law:** CRA Methodology (Concrete → Representational → Abstract); Dyscalculia Content Audit dimension 1 (CRA Fidelity)
- **Severity:** MEDIUM (unchanged)
- **Category:** Instructional methodology (applied to UI)
- **Element:** All financial inputs and outputs
- **Description:** The UI still offers bar charts and raw figures but no concrete/manipulative visual — coin-stack widgets, 10×10 spending-tile grids, proportional-area "one tile = $10k" portfolio visuals, etc. The `chartStyle` enum in `DyscalculiaSettings` does not yet include a `concrete` option.
- **Impact:** Dyscalculic adults often retain magnitude understanding better when a concrete visual equivalent is offered for reasoning about quantity.
- **Evidence:** `src/app/services/dyscalculia.service.ts` — no `chartStyle = 'concrete'` branch; no tile/coin component in `src/app/components/`.
- **Remediation:** Add a `concrete` option to `ChartStyle` and ship one opt-in visual: portfolio → stacked unit tiles (1 tile = $10k); monthly spending → 10×10 grid colored by category; savings rate → filled-circle "cents on the dollar."
- **Effort Estimate:** L

#### F-006: Still no calm/progressive-reveal "run simulation" mode
- **Standard/Law:** §504 analog — environmental modifications; Dyscalculia Content Audit — Math Anxiety
- **Severity:** MEDIUM (unchanged)
- **Category:** Math-anxiety accommodation
- **Element:** `src/app/components/screens/montecarlo-screen/montecarlo-screen.component.ts`
- **Description:** Monte Carlo already reframes outcomes calmly (F-002 / F-003 fixed — natural frequency, neutral tone, plain-language summary), but clicking Run still drops the full wall of charts/percentiles at once. No progressive-reveal "Next / Next / Next" flow, no one-section-at-a-time pacing, no tie-in to the existing `calmTransitions` setting for sequencing.
- **Remediation:** Add a `mcMode: 'full' | 'calm'` setting; in calm mode gate each result card behind an explicit "Show next" button.
- **Effort Estimate:** M

#### F-008: Comorbidity gaps — voice entry, break reminders, dysgraphia support
- **Standard/Law:** Dyscalculia Content Audit — Comorbidity Support
- **Severity:** MEDIUM (unchanged)
- **Category:** Universal design
- **Element:** Global
- **Description:** The `NumericInputDirective` now sets `inputmode="decimal"` (mobile keypad friendly), which partially helps dysgraphic users on mobile. But there is still no browser `SpeechRecognition` voice-entry affordance, no "break after N minutes" reminder pattern, and no chunked wizard variant for the long Assumptions screen (695 lines of template).
- **Remediation:** Add a voice-to-number affordance on `appNumeric="currency"` fields (behind a setting). Add optional session-break toast. Chunk Assumptions into Household → Accounts → Healthcare-regime → Transition wizard steps.
- **Effort Estimate:** M

#### F-013: `fmtCents` / `fmtYear` / `fmt*` helpers sidestep the dyscalculia format pipeline
- **Standard/Law:** Dyscalculia Content Audit — Number Presentation
- **Severity:** MEDIUM
- **Category:** Number presentation consistency
- **Element:**
  - `src/app/components/screens/location-compare/location-compare.component.ts:1014-1016` (`fmtCents` — `'$' + val.toLocaleString(undefined, { minimumFractionDigits: 2 })`)
  - `src/app/components/screens/location-compare/location-compare.component.ts:1019-1021` (`fmtYear`)
  - `src/app/components/screens/taxes-screen/taxes-screen.component.ts:251-253` (`fmtCents` duplicate)
- **Description:** To support the "taxes rounded to cents" change from this cycle, two screens added private `fmtCents` helpers that call `toLocaleString` directly and ignore `dyscalculia.isEnabled()`. Same pattern for the new `fmtYear`. Users who enable `numberFormat: 'spaced'` or `'words'` see a different format on these cells than on adjacent cells.
- **Impact:** Inconsistency is the thing a user with working-memory limits notices first — each cell's format should be predictable.
- **Remediation:** Add `DyscalculiaService.formatCurrencyPrecise(amount, { fractionDigits, unit })` that threads through the same three format modes (standard/spaced/words) but honors a decimal-precision arg; migrate both `fmtCents` call sites. Add `formatCurrency(amount, '/yr')` path for `fmtYear` (already exists; just call it).
- **Effort Estimate:** S

---

### LOW Findings

#### F-011: Preferences still `localStorage`-only — no cross-device continuity
- **Standard/Law:** §504 analog — permanent cognitive prosthetic / lifelong accommodation
- **Severity:** LOW (unchanged — status: OPEN)
- **Category:** Accommodation persistence
- **Element:** `src/app/services/dyscalculia.service.ts:201-219`
- **Description:** `ApiService.getPreferences()` now exists (`src/app/services/api.service.ts:104`) and is used by `items.service.ts`, but `dyscalculia.service.ts` still persists/loads only to/from `localStorage`. A user who configures the dyscalculia panel on desktop must repeat on mobile.
- **Remediation:** In `DyscalculiaService.loadSaved()`, after loading from `localStorage`, call `apiService.getPreferences()` and hydrate any server-returned `dyscalculia` blob; on `persist()`, also PUT to `/api/me/preferences`. Prefer server value on first login to support cross-device.
- **Effort Estimate:** S (client) + coordination

#### F-014: `--dark-red` severity color used outside Monte Carlo for value framing
- **Standard/Law:** Dyscalculia Content Audit — Math Anxiety / meaningful use of color
- **Severity:** LOW
- **Category:** Math anxiety / visual accessibility
- **Element:**
  - `src/app/components/screens/location-compare/location-compare.component.ts:729,735,753,834` (`.total-cell.priciest`, `.worst-in-row`, and cliff-penalty cell color)
  - `src/app/components/screens/montecarlo-screen/montecarlo-screen.component.ts:692,818` (`.regime-col.bear`, `.result-value.worst`)
  - `src/app/components/screens/scenarios-screen/scenarios-screen.component.ts:248,282` (`.compare-table td.worst`, `.sc-value.bad`)
  - `src/app/components/screens/roth-screen/roth-screen.component.ts:156` (`.result-value.tax`)
  - `src/app/components/screens/assumptions-screen/assumptions-screen.component.ts:491` (`.hc-src-aca-unsubsidized`)
- **Description:** The Monte Carlo "success rate" card correctly retired `.danger` red (F-002 FIXED), but `#E57373` now reappears on the same screen as `.result-value.worst` (5th-percentile "worst case"), and across Compare (priciest city, worst-in-row), Scenarios (worst, bad), Roth (taxes paid), and Assumptions (aca-unsubsidized). Every one of these frames a user-input-driven number in red — the same anti-pattern the Monte Carlo fix addressed.
- **Impact:** Users who rely on calm color framing see red return as soon as they cross from the success-rate card to the next percentile card or open Compare. The `--dark-neutral` token (added explicitly "to replace red for soft concerns") is defined but unused outside Monte Carlo.
- **Remediation:** Audit every `color: var(--dark-red)` rule on non-error data and migrate to `--dark-neutral` (for soft concerns) or `--dark-amber` (for emphasis). Reserve `--dark-red` for hard errors (`.save-msg.err`, validation failures, delete-button hover).
- **Effort Estimate:** S

#### F-015: `getAnchor` has no `monthly-cost` context for the new healthcare-audit values
- **Standard/Law:** Dyscalculia Content Audit — Magnitude Anchoring
- **Severity:** LOW
- **Category:** Number sense
- **Element:** `src/app/services/dyscalculia.service.ts:132-175`
- **Description:** The extended `getAnchor(amount, context, yearlySpending)` helper handles `portfolio`, `withdrawal-year`, `percentile`, `general`, and `monthly-cost`. The new audit banner values — "MAGI," "FPL %," "cliff penalty," "transition-year extra income" — don't map cleanly to any existing context, so the banner renders the number with no anchor at all.
- **Remediation:** Add `'magi'`, `'fpl-pct'`, and `'cliff-penalty'` contexts with grounded anchors — e.g. for FPL % `< 150 → "near poverty line"`, `150-400 → "eligible for ACA subsidy"`, `> 400 → "above the subsidy cliff"`; for cliff penalty `"this is what you'd pay extra per month if you stayed above the cliff"`.
- **Effort Estimate:** S

---

## Delta Table vs 2026-04-16 Audit

| ID | Title (prior audit) | Sev | 2026-04-19 Status | Evidence |
|----|---------------------|-----|-------------------|----------|
| F-001 | FIRE formula without plain-language walkthrough | HIGH | **FIXED** | `src/app/components/screens/fire-calc-screen/fire-calc-screen.component.ts:67-82` — step-ladder ordered list ("You spend about …", "At 4% you need 25× …", "That's 40,000 × 25 = 1,000,000"). `multiplier()` computed at line 198. |
| F-002 | Monte Carlo success-rate card styled `.danger` red | HIGH | **FIXED** | `montecarlo-screen.component.ts:507-510` uses `[class.success]`/`[class.warn]`/`[class.neutral]` from `toneForSuccessRate`. Dyscalculia service implements neutral-never-danger mapping at `dyscalculia.service.ts:193-197`. Comment at `montecarlo-screen.component.ts:24-26` documents the retirement of `#E57373`. |
| F-003 | Monte Carlo outputs lack magnitude anchors + natural frequency | HIGH | **FIXED** | `montecarlo-screen.component.ts:526` (`{{ dyscalculia.naturalFrequency(r.successRate) }} simulated futures`), `:535,543,551` (`dyscalculia.getAnchor(r.median/p5/p95, 'percentile', annualSpending())`). Calm summary paragraph at `:557-566`. |
| F-004 | No concrete/manipulative layer | MEDIUM | **OPEN** | `DyscalculiaSettings.chartStyle` has no `'concrete'` variant. No coin-stack / tile-grid component exists. Carried forward. |
| F-005 | Anchor helper only for cost buckets | MEDIUM | **FIXED** | `dyscalculia.service.ts:132-175` — `getAnchor(amount, context, yearlySpending?)` handles `monthly-cost`, `portfolio`, `withdrawal-year`, `percentile`, `general`. Wired at Monte Carlo (three percentiles), Roth (conversion amount → `withdrawal-year`), Taxes (annual income → `withdrawal-year`), Assumptions (portfolio hint). |
| F-006 | No calm/progressive-reveal run mode | MEDIUM | **PARTIAL** | Natural-frequency phrasing + plain-language summary + neutral tone are in; progressive-reveal / gated "Next" flow not yet shipped. |
| F-007 | Financial glossary inline-only | MEDIUM | **FIXED** | `src/app/services/glossary.service.ts` — full `/api/glossary` fetch, `find()`, `terms` signal; `HelpService` / help-drawer pattern ships with per-page glossary links (see prior commit `2ef1dc1`). |
| F-008 | Voice entry / break reminders / dysgraphia | MEDIUM | **PARTIAL** | `NumericInputDirective` sets `inputmode="decimal"` for mobile keypad (`numeric-input.directive.ts:67-69`). Voice entry, break reminders, and Assumptions wizard chunking not yet shipped. |
| F-009 | Step-attribute coverage inconsistent | LOW | **FIXED** | `src/app/directives/numeric-input.directive.ts` — `appNumeric="currency\|percent\|age\|year\|rate\|fx"` standardizes `step`/`min`/`max`/`inputmode`; cites F-009 at line 37. |
| F-010 | No inline hint for "Safe Withdrawal Rate" | LOW | **FIXED** | `fire-calc-screen.component.ts:48-50` — `.param-hint`: "The share of your savings you plan to spend each year. 4% is a common starting point (Trinity study)." |
| F-011 | Preferences localStorage-only | LOW | **OPEN** | `dyscalculia.service.ts:201-219` still only touches `localStorage`. `ApiService.getPreferences()` exists but is not called from `DyscalculiaService`. |

**Summary:** 7 FIXED, 2 PARTIAL, 2 OPEN out of 11 prior findings. Four new findings introduced by the 2026-04-19 healthcare-regime + multi-location + cents-precision work: **F-012 (HIGH)**, **F-013 (MEDIUM)**, **F-014 (LOW)**, **F-015 (LOW)**.

---

## Composite Score

| Domain | Weight | Score | Weighted |
|--------|--------|-------|----------|
| Math Instruction Alignment (CRA as UI) | 20% | 75 | 15.0 |
| Number Presentation & Magnitude | 20% | 87 | 17.4 |
| Math Anxiety / Calm Framing | 15% | 85 | 12.8 |
| Accommodation & Scaffolding | 15% | 92 | 13.8 |
| Visual Accessibility | 10% | 85 | 8.5 |
| Equity / Comorbidity Support | 10% | 75 | 7.5 |
| Formula Exposure & Literacy | 5% | 85 | 4.3 |
| Persistence of Accommodations | 5% | 60 | 3.0 |
| **Composite** | **100%** | | **82.3 → +3 for consistent `DyscalculiaService` integration across new screens (Roth, Taxes, Assumptions) = 85** |

### Score Interpretation

| Score | Grade | Interpretation |
|-------|-------|-----------------|
| 80–100 | A | Excellent compliance |
| 60–79  | B | Good compliance; specific improvements identified |
| 40–59  | C | Moderate compliance; significant gaps |
| 20–39  | D | Poor compliance; major revisions needed |
| 0–19   | F | Critical failure |

**Grade: A (85/100).** Upgraded from B (78) at 2026-04-16. The project is in the lower band of A; closing F-012 alone would lift it to ~88.

---

## Recommendations — Prioritized by Effort-to-Impact

| Priority | Finding | Action | Effort | Impact |
|----------|---------|--------|--------|--------|
| 1 | F-012 | Replace `'$' + x.toFixed(0)` patterns in Assumptions + Compare audit banner with `dyscalculia.formatCurrency(x, '/yr')` / `formatPercentage` | S | HIGH |
| 2 | F-013 | Add `formatCurrencyPrecise` to `DyscalculiaService`; migrate `fmtCents` in Compare + Taxes | S | MEDIUM |
| 3 | F-014 | Audit every `color: var(--dark-red)` on data (not errors); migrate to `--dark-neutral` / `--dark-amber` | S | MEDIUM |
| 4 | F-015 | Extend `getAnchor` with `magi` / `fpl-pct` / `cliff-penalty` contexts; wire into audit banner | S | MEDIUM |
| 5 | F-011 | `DyscalculiaService.persist/loadSaved` → additionally sync `/api/me/preferences` | S | MEDIUM |
| 6 | F-008 (rest) | Voice-entry affordance on `appNumeric="currency"` fields; optional break reminder; Assumptions wizard chunking | M | MEDIUM |
| 7 | F-006 (rest) | "Calm run" progressive-reveal mode for Monte Carlo | M | MEDIUM |
| 8 | F-004 | `chartStyle = 'concrete'` — one tile/coin visual for portfolio or spending breakdown | L | LOW |

---

## What Passed (Strengths, 80%+ compliance)

| Component | Standard Met |
|-----------|-------------|
| `DyscalculiaService` extended with `getAnchor(context)`, `naturalFrequency`, `toneForSuccessRate`, `numberSpacingClass` (`dyscalculia.service.ts:114-197`) | Accommodation — multiple representations |
| FIRE-calc step-ladder explanation of the FIRE formula (`fire-calc-screen.component.ts:67-82`) | CRA scaffolding; formula literacy |
| Monte Carlo neutral-tone success card + natural-frequency phrasing + plain-language summary (`montecarlo-screen.component.ts:505-566`) | Math anxiety / positive framing |
| Monte Carlo percentile anchors — every p5 / median / p95 has "about N years of planned spending" (`:535,543,551`) | Magnitude anchoring |
| Percentile palette retired `#E57373` for 5th percentile — uses amber gradient (`montecarlo-screen.component.ts:27-33`) | Calm framing |
| Roth conversion amount input binds `numberSpacingClass` + anchor (`roth-screen.component.ts:64-69`) | Number presentation |
| Taxes-screen Annual Income input binds `numberSpacingClass` + yearly/monthly/anchor triple (`taxes-screen.component.ts:27-36`) | Number presentation |
| `NumericInputDirective` standardizes `step` / `min` / `max` / `inputmode` by semantic kind (`numeric-input.directive.ts`) | Input scaffolding |
| `GlossaryService` fetches `/api/glossary` with signal-backed cache (`glossary.service.ts`) | Scaffolding — definitions |
| Bar-only charting preserved (no pies anywhere) | Dyscalculia visual accessibility |
| `TaxService` extracted — pure-function bracket math with well-documented dependency direction (`tax.service.ts:1-12`) | Separation of presentation / computation |
| Tax values rounded to cents in summaries (honest precision display) | Error-analysis transparency |
| Multi-location Monte Carlo schedule retains neutral-tone framing across new locations | Math anxiety consistency |
| Compare screen audit banner exposes inputs driving the numbers (Adults, MAGI, FPL%, ACA rules) so the user can trace cause → effect | Error-analysis scaffolding |
| Explicit grounding in W3C COGA + GOV.UK dyscalculia research (retained) | Evidence-based design |
| User-controlled 3-tier font sizing, `Ctrl+Shift+A` panel, LiveAnnouncer (retained) | Universal design |

---

## Version History

| Version | Date | Auditor | Changes |
|---------|------|---------|---------|
| 1.0 | 2026-04-16 | Claude (automated) | Initial dyscalculia audit — 78/100 B |
| 2.0 | 2026-04-19 | Claude Opus 4.7 (1M context) | Re-audit — 85/100 A. 7 prior findings FIXED, 2 PARTIAL, 2 OPEN. 4 new findings introduced by 2026-04-19 healthcare-regime + multi-location + cents-precision work. |
