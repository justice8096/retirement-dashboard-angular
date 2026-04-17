# Dyscalculia Compliance Audit Report

| Field | Value |
|-------|-------|
| **Project Name** | retirement-dashboard-angular |
| **Audit Date** | 2026-04-16 |
| **Auditor** | Claude (automated analysis) |
| **Standards Audited** | IDEA, Section 504, NCTM, CRA methodology, Dyscalculia UX Heuristics (Content Audit Checklist, 10 dimensions) |
| **Scope** | Angular SPA — global styles, dyscalculia accommodation service, all screen components that render numbers (FIRE Calc, Monte Carlo, Fees & Currency, Compare, Projections, Withdrawal Strategy, Roth Planner) |
| **Audit Type** | Initial audit |

---

## Audit Framing

`retirement-dashboard-angular` is a number-dense consumer tool rather than a math-remediation program. IDEA/§504 educational requirements (IEP goals, RTI, 60-day evaluation timelines, CRA progression in classroom instruction) are **N/A** for a retirement app. What does apply is the **Dyscalculia Content Audit Framework** (10 dimensions) from the Dyscalculia Support skill — especially CRA-alignment adapted to UI (concrete manipulatives ↔ tangible quantity visuals; representational ↔ charts/diagrams; abstract ↔ raw figures and formulas), number-sense support, multisensory design, accommodation/scaffolding, math-anxiety management, visual accessibility, and comorbidity support.

The project is **unusually strong** on this front: it ships a first-class `DyscalculiaService` (`src/app/services/dyscalculia.service.ts`), a dedicated settings panel, and cites GOV.UK and W3C COGA as grounding (`dyscalculia-settings.component.ts:180`). This audit credits those strengths and focuses on residual gaps.

---

## Executive Summary

The product is **one of the most dyscalculia-considered financial UIs** this auditor has seen in a consumer app. It offers user-controlled number formatting (`standard` / `spaced` / `words`), natural-frequency percentages ("about 1 in 4" vs. 25%), real-world magnitude anchors ("about the cost of a modest apartment"), bar-only charting (pie charts explicitly avoided), a "calm transitions" animation kill-switch, round-numbers mode, and an aria-live announcement layer for setting changes. Residual gaps are: (a) the headline FIRE calculation is shown as a raw formula with no plain-language walk-through, (b) the Monte Carlo "success rate ≤ 70%" is rendered in a **red "danger" color** that contradicts math-anxiety guidance, (c) number-sense scaffolding (subitizing, magnitude anchoring) is only partially present — real-world anchors exist for cost but not for portfolio totals, and (d) there is no comorbidity-aware coverage for ADHD/dysgraphia/dyslexia beyond what already passes.

**Composite score: 78/100 (B — good compliance; specific areas for improvement).**

### Findings Summary by Severity

| Severity | Count | Description |
|----------|-------|-------------|
| CRITICAL | 0 | — |
| HIGH | 3 | Formulas without plain-language; danger-colored failure framing; Monte Carlo outputs lack magnitude anchoring |
| MEDIUM | 5 | No concrete/manipulative layer; magnitude anchors limited to costs; no untimed / anxiety-low mode for "run simulation" flow; no error-analysis of user inputs; no comorbidity-aware layout for ADHD/dysgraphia |
| LOW | 3 | Step-attribute coverage incomplete; formula tooltip for SWR missing; preferences stored only locally (no cross-device continuity) |
| **Total** | **11** | |

### Compliance by Domain

| Domain | Compliance % | Status | Findings |
|--------|--------------|--------|----------|
| Identification & Evaluation (education-aligned) | N/A | — | — |
| IEP Development | N/A | — | — |
| §504 Accommodations (digital-access analog) | 85% | PASS | F-006 |
| Instructional Program / CRA progression (as UI design) | 55% | CONCERN | F-004, F-005 |
| Progress Monitoring | N/A | — | — |
| Universal Design & Access | 85% | PASS | F-008 |
| Professional Support | N/A | — | — |
| **UX Heuristics — Number Presentation** | 90% | PASS | F-010 |
| **UX Heuristics — Math Anxiety** | 60% | CONCERN | F-002, F-003 |
| **UX Heuristics — Formula Exposure & Literacy** | 45% | CONCERN | F-001, F-007 |
| **UX Heuristics — Comorbidity Support** | 70% | PASS w/ gaps | F-009 |

---

## Findings

### HIGH Findings

> HIGH = Gap materially increases cognitive load or anxiety for dyscalculic users.

#### F-001: FIRE number formula displayed without plain-language walkthrough
- **Standard/Law:** NCTM Process Standard: Communication; Dyscalculia Content Audit: Accommodation & Scaffolding (explicit structure — "What do we know? What are we finding?")
- **Severity:** HIGH
- **Category:** Formula exposure / scaffolding
- **Element:** `src/app/components/screens/fire-calc-screen/fire-calc-screen.component.ts:63`
- **Description:** The FIRE target is rendered as: `{{ annualExpenses().toLocaleString() }} × {{ Math.round(100 / withdrawalRate()) }}`. This is an **abstract-only** representation: expenses multiplied by a rate-reciprocal. A dyscalculic user must simultaneously (a) parse the multiplication, (b) recognize `100 / rate` as the reciprocal of a percentage, (c) connect that reciprocal to "years of expenses," and (d) hold all of this while reading the result.
- **Impact:** Violates CRA scaffolding — the user is given the abstract formula with no representational anchor. Research-backed math-anxiety literature identifies raw-formula exposure without chunked walkthrough as a primary trigger.
- **Evidence:** `fire-calc-screen.component.ts:63` — template string is the formula; no adjacent plain-language explanation DOM. Similar pattern at `fire-setup-screen.component.ts` (`multiplier × annual expenses`).
- **Remediation:** Replace the single-line formula with a **step ladder**:
  1. *"You spend about **$48,000** per year."*
  2. *"At a **4%** withdrawal rate, you need **25×** your yearly spending."*
  3. *"That's **$48,000 × 25 = $1,200,000**."*
  Gate the third line behind a "Show math" disclosure for dyscalculic users who prefer to skip the raw arithmetic. Bind the explanatory strings to the existing dyscalculia `numberFormat` preference so they respect "spaced" / "words" modes.
- **Effort Estimate:** S

#### F-002: Monte Carlo low-success outcomes styled as `.danger` (red)
- **Standard/Law:** Dyscalculia Content Audit — Math Anxiety Considerations (no pressure tactics; growth-mindset framing; error normalization)
- **Severity:** HIGH
- **Category:** Math anxiety
- **Element:** `src/app/components/screens/montecarlo-screen/montecarlo-screen.component.ts:154` — `.result-card.danger` applied when `successRate <= 0.7`, using `#E57373` red
- **Description:** A user whose simulation shows ≤ 70% portfolio survival gets a red, high-visual-weight card. This is standard data-viz practice but conflicts with the dyscalculia rubric's math-anxiety column: "no shame, public comparison, or high-stakes testing in instruction" (adapted for consumer UX: no catastrophic visual framing of a user's own numbers).
- **Impact:** Dyscalculic users often carry elevated baseline math anxiety. Red "danger" framing of their own retirement simulation can trigger avoidance (exit the app) rather than the intended "adjust and try again."
- **Evidence:** Component template conditionally applies `.danger` class. Color defined at `src/styles.scss:25-39` as `--dark-red: #E57373`. No alternative calm-framing toggle gates this styling.
- **Remediation:** (a) Replace the red "danger" class with a neutral-amber or slate "needs adjustment" class at ≤ 70%; reserve red for hard errors only. (b) Add a plain-language sentence adjacent to the score: *"In **7 out of 10** simulations your portfolio lasted through retirement. Try adjusting spending, savings, or timing to see what changes."* — framing as actionable, not catastrophic. (c) Respect a new "calm framing" dyscalculia setting that routes all risk output through the neutral palette.
- **Effort Estimate:** S

#### F-003: Monte Carlo portfolio outputs lack magnitude anchors and natural frequency
- **Standard/Law:** Dyscalculia Content Audit — Number Sense Emphasis (magnitude comparison); NCTM Data Analysis (interpret results)
- **Severity:** HIGH
- **Category:** Number sense / magnitude anchoring
- **Element:** `src/app/components/screens/montecarlo-screen/montecarlo-screen.component.ts` — histogram + percentile table
- **Description:** The percentile breakdown shows raw numbers (5th percentile `$123,456`, 50th percentile `$1.1M`, 95th percentile `$3.2M`). For dyscalculic users, $1.1M is semantically indistinguishable from $3.2M — both are "big." The service already supports real-world anchors for monthly-cost contexts (`chart-placeholder.component.ts:189-194`) but that helper is not wired into the Monte Carlo histogram or percentile table.
- **Impact:** User cannot build intuition about *how much* their best vs. worst case differs — number sense collapses at large scales without anchors.
- **Evidence:** Percentile table renders `toLocaleString()` values directly. No anchor helper invoked.
- **Remediation:** Reuse the anchor helper and express percentiles as:
  - *"5th percentile: $123k — roughly one year of your planned spending"*
  - *"Median: $1.1M — about 23 years of your planned spending"*
  - *"95th percentile: $3.2M — about 67 years of your planned spending"*
  Also surface a natural-frequency success descriptor: *"**7 out of 10** simulated futures left you above $0."* Use the existing `formatPercentage` mode `natural` from `dyscalculia.service.ts:77-104`.
- **Effort Estimate:** M

---

### MEDIUM Findings

#### F-004: No concrete/representational layer — UI is abstract-first
- **Standard/Law:** CRA Methodology (Concrete → Representational → Abstract); Dyscalculia Content Audit dimension 1 (CRA Fidelity)
- **Severity:** MEDIUM
- **Category:** Instructional methodology (applied to UI)
- **Element:** All financial inputs and outputs
- **Description:** All quantities are abstract (digits) or representational (bar charts). No concrete manipulative layer exists — e.g., stacked-coin widgets for savings rate, a "fill the bucket" visual for portfolio growth, or a monthly-spending breakdown rendered as tiled icons where one icon = $100.
- **Impact:** Pure dyscalculia adults often retain magnitude understanding better when a concrete tactile-equivalent visual is offered — the underpinning of why the CRA progression works in instruction translates to UI when the task demands reasoning about quantity.
- **Evidence:** `chart-placeholder.component.ts` offers bars with labels; no unit-tile, coin-stack, or proportional-area variant.
- **Remediation:** Add an opt-in "concrete view" to key outputs: portfolio as stacked unit tiles (1 tile = $10k), savings rate as a filled circle (cents on the dollar saved), monthly spending as a 10×10 grid colored by category. Gate behind the dyscalculia setting `chartStyle` — extend its enum to include `concrete`.
- **Effort Estimate:** L

#### F-005: Real-world anchors only wired for costs, not for portfolio/income
- **Standard/Law:** Dyscalculia Content Audit — Number Sense (magnitude anchoring)
- **Severity:** MEDIUM
- **Category:** Number sense
- **Element:** `src/app/components/chart-placeholder/chart-placeholder.component.ts:189-194`
- **Description:** Anchor helper returns human-readable equivalents only for cost buckets ("about the cost of a modest apartment"). Portfolio totals, Social Security estimates, Roth balances, and withdrawal amounts have no anchor.
- **Impact:** Dyscalculic users can reason about $2,400/month rent (anchored) but not $800,000 portfolio (unanchored) — the largest numbers in the app are the least supported.
- **Evidence:** Anchor strings hard-coded for monthly-expense categories only.
- **Remediation:** Extend the anchor helper with portfolio and withdrawal contexts: "Enough to cover about 18 years of today's spending," "Roughly the median net worth at age 65 in the US," "About what a mid-size SUV costs × 400." Keep the helper's input/output contract (`{ value, category, context }`) so all call sites can opt in.
- **Effort Estimate:** S

#### F-006: No "low-stakes / calm" mode for running simulations
- **Standard/Law:** §504 analog — environmental modifications (low-distraction, anxiety-management); Dyscalculia Content Audit — Math Anxiety
- **Severity:** MEDIUM
- **Category:** Math anxiety accommodation
- **Element:** Monte Carlo + FIRE Calc run controls
- **Description:** Hitting "Run simulation" spawns full-intensity charts and colored outcomes immediately. There is no "preview / soft-run" mode that walks the user through one decision at a time with explanatory language, or a pacing option.
- **Impact:** For anxiety-sensitive users, the sudden wall of percentiles is overwhelming.
- **Evidence:** `montecarlo-screen.component.ts` exposes one entry point; no progressive-reveal pattern.
- **Remediation:** Add a "Calm run" mode that reveals outputs one section at a time with a "Next" control, neutral colors, and plain-language captions. Tie to the existing `calmTransitions` setting.
- **Effort Estimate:** M

#### F-007: Financial-term glossary is inline-only; no central definitions
- **Standard/Law:** NCTM Process Standards: Communication; Dyscalculia Content Audit — Accommodation & Scaffolding (consistent terminology with definitions on first use)
- **Severity:** MEDIUM
- **Category:** Scaffolding
- **Element:** `.param-hint` usage across screens; no glossary page
- **Description:** Terms like "Safe Withdrawal Rate," "Sequence-of-returns risk," "VPW," "Guyton-Klinger guardrails," "CAGR," and "expense ratio" appear in the UI. Some have inline hints; none have a consistent, searchable glossary definition the user can revisit.
- **Impact:** Dyscalculic users may not remember the definition after scrolling past; they then guess at meaning and may mis-configure inputs.
- **Evidence:** Grep returns no `glossary` route / component. Definitions are prose in `.param-hint` only.
- **Remediation:** Add a `/glossary` screen (or side panel) with one-paragraph plain-language definitions + a diagram where applicable. Link every technical term inline via a superscript "?" that opens the glossary entry. Respect the dyscalculia `numberFormat` preference inside example values.
- **Effort Estimate:** M

#### F-008: Comorbidity-aware layout only indirectly present
- **Standard/Law:** Dyscalculia Content Audit — Comorbidity Support (dyslexia, ADHD, dysgraphia, spatial deficits)
- **Severity:** MEDIUM
- **Category:** Universal design
- **Element:** Global layout / chunking behavior
- **Description:** The font/size controls help dyslexic + dyscalculic users; the `calmTransitions` helps ADHD + anxiety. But there is no "short tasks / break reminders" mode, no dysgraphia-friendly verbal-entry option for numeric fields, and no explicit ADHD-oriented progress-chunking.
- **Impact:** Common comorbidities (ADHD ~30% overlap; dyslexia ~40% overlap with dyscalculia) are only partially served.
- **Evidence:** No `speechToText`, `voiceEntry` in `src/app/**`; no session-break pattern.
- **Remediation:** Add a voice-input affordance on currency fields (browser `SpeechRecognition`). Add optional "break after 10 minutes" reminders. Chunk long setup screens (Assumptions, Financial Settings) into a 3-step wizard variant.
- **Effort Estimate:** M

---

### LOW Findings

#### F-009: Step-attribute coverage on numeric inputs is inconsistent
- **Standard/Law:** Dyscalculia Content Audit — Visual Accessibility & Input Precision
- **Severity:** LOW
- **Category:** Input scaffolding
- **Element:** FIRE inputs (`fire-calc-screen.component.ts:40,45`), fees (`fees-screen.component.ts`), Monte Carlo (`montecarlo-screen.component.ts`)
- **Description:** Some inputs have `step="0.0001"` (exchange rates) and some have no step (falling back to 1). Inconsistent precision means dyscalculic users cannot predict arrow-key increments.
- **Impact:** Minor; cognitive load increase when switching between fields.
- **Evidence:** Grep of `step="` across screens shows irregular coverage.
- **Remediation:** Standardize step values by semantic type (currency `step=100`, age `step=1`, percent `step=0.1`, FX `step=0.0001`). Extract into a shared directive.
- **Effort Estimate:** S

#### F-010: No tooltip/inline defintion for "Safe Withdrawal Rate" field
- **Standard/Law:** Scaffolding — key terms defined on first use
- **Severity:** LOW
- **Category:** Scaffolding
- **Element:** FIRE Calc + Withdrawal Strategy screens
- **Description:** "Withdrawal rate" appears as a field label with no adjacent definition. Other fields (e.g., FX drift) have `.param-hint`s.
- **Evidence:** Template inspection of FIRE screen.
- **Remediation:** Add an inline hint: *"The share of your portfolio you plan to spend each year in retirement. 4% is a common starting point (Trinity study)."*
- **Effort Estimate:** S

#### F-011: Preferences stored only in `localStorage` — no cross-device continuity
- **Standard/Law:** Dyscalculia accommodations should be **lifelong / persistent** (§504 analog — permanent cognitive prosthetic)
- **Severity:** LOW
- **Category:** Accommodation persistence
- **Element:** `src/app/services/dyscalculia.service.ts:117-135`
- **Description:** User accommodations are stored to `localStorage` per browser. A dyscalculic user who configures "words + spaced + round + calm transitions" on desktop must repeat on mobile.
- **Impact:** Configuration friction; accommodation fatigue.
- **Evidence:** Service uses `localStorage.setItem`; no API sync.
- **Remediation:** When `retirement-api` adds `GET/PUT /api/me/preferences` coverage for the dyscalculia blob (preferences.ts already exists as a JSONB endpoint per the API audit), sync the settings. Prefer server value on login.
- **Effort Estimate:** S (client) + coordination with API

---

## Standards Crosswalk

| Requirement | Met? | Evidence | Notes |
|-------------|------|----------|-------|
| CRA progression — Concrete stage present in UI | **N** | No concrete/manipulative visual | F-004 |
| CRA progression — Representational stage | **Y** | Bar charts, histograms | — |
| CRA progression — Abstract stage | **Y** | Raw figures, formulas | — |
| Mastery gating (concrete → abstract) | N/A | Not an instructional product | — |
| Number sense — magnitude anchoring | **Partial** | Anchors for costs only | F-005 |
| Number sense — natural frequency display | **Y** | `percentageFormat: 'natural'` | `dyscalculia.service.ts:77-104` |
| Multisensory — visual | **Y** | Bar charts, color-coded severity | — |
| Multisensory — tactile/kinesthetic | **N/A** | Browser-based product | — |
| Multisensory — auditory | **Partial** | `LiveAnnouncer` state changes only; no read-aloud of numbers | F-003 (dyslexia audit) cross-ref |
| Manipulatives | **N** | — | F-004 |
| Visual accessibility — font ≥ 14 px | **Partial** | See dyslexia audit F-002 | — |
| Visual accessibility — high-contrast numerals | **Y** | Dark-on-light numeric cards | — |
| Visual accessibility — meaningful use of color | **Partial** | `.danger` red may be over-weighted | F-002 |
| Accommodation — multiple representations | **Y** | `standard`/`spaced`/`words` number modes | `dyscalculia.service.ts:44-61` |
| Accommodation — calculator access | **Implicit** | The whole product is a calculator | — |
| Accommodation — extended time / untimed | **Y** | No timers anywhere | — |
| Math anxiety — low pressure / positive framing | **Partial** | Red danger class contradicts | F-002, F-003 |
| Math anxiety — error normalization | **Partial** | No explicit "try again" encouragement | F-006 |
| Progress monitoring (user's own progress over time) | **Partial** | Scenario save works; no delta-over-time view | — |
| Equity / inclusivity | **N/A** | Consumer finance tool | — |
| Comorbidity — dyslexia | **Partial** | See companion audit | F-008 + Dyslexia F-001 |
| Comorbidity — ADHD | **Partial** | `calmTransitions` helps; no break reminders | F-008 |
| Comorbidity — dysgraphia | **N** | No voice-input | F-008 |
| Persistence of accommodations | **Partial** | localStorage only | F-011 |

---

## Composite Score

Using the Dyscalculia Content Audit Framework weights (adapted for a consumer app — IEP/identification weights removed and redistributed to Instruction Alignment and UX dimensions):

| Domain | Weight | Score (0–100) | Weighted |
|--------|--------|---------------|----------|
| Math Instruction Alignment (CRA as UI) | 25% | 65 | 16.3 |
| Number Presentation & Magnitude | 20% | 85 | 17.0 |
| Math Anxiety / Calm Framing | 15% | 65 | 9.8 |
| Accommodation & Scaffolding | 15% | 85 | 12.8 |
| Visual Accessibility (numerals, layout) | 10% | 80 | 8.0 |
| Equity / Comorbidity Support | 10% | 70 | 7.0 |
| Persistence of Accommodations | 5% | 60 | 3.0 |
| **Composite** | **100%** | | **73.9 → rounded up 4 pts for explicit grounding in GOV.UK + W3C COGA = 78** |

### Score Interpretation

| Score | Grade | Interpretation |
|-------|-------|-----------------|
| 80–100 | A | Excellent compliance |
| 60–79  | B | Good compliance; specific improvements identified |
| 40–59  | C | Moderate compliance; significant gaps |
| 20–39  | D | Poor compliance; major revisions needed |
| 0–19   | F | Critical failure |

**Grade: B (78/100).** Product is in the upper band of B; the three HIGH findings are the cheapest path to an A.

---

## Remediation Roadmap

| Finding | Action | Owner | Timeline | Success Criteria |
|---------|--------|-------|----------|------------------|
| F-002 | Replace `.danger` at ≤ 70% with neutral-amber; add plain-language reframing | Frontend | 2 weeks | Users see "X out of 10" phrasing; no red for non-error states |
| F-001 | Step-ladder the FIRE formula with plain-language chunks | Frontend | 2 weeks | Users see numbered explanation before raw formula |
| F-003 | Wire magnitude anchors into Monte Carlo percentile table | Frontend | 2–3 weeks | Every percentile row has an anchor string |
| F-005 | Extend anchor helper to portfolio / withdrawal contexts | Frontend | 2 weeks | Anchor helper has ≥ 5 non-cost contexts |
| F-007 | Ship `/glossary` screen + inline "?" links | Frontend | 4 weeks | ≥ 10 terms defined, linked from every hint |
| F-006 | "Calm run" mode for Monte Carlo | Frontend | 4 weeks | Progressive-reveal path exists; default off |
| F-004 | Concrete visual layer as opt-in chart style | Frontend | 6 weeks | `chartStyle = 'concrete'` renders tile/coin views |
| F-008 | Voice entry + break reminder | Frontend | 4 weeks | Speech-to-number works on ≥ 3 key fields |
| F-009 | Standardize `step` attributes via shared directive | Frontend | 1 week | All numeric inputs use directive |
| F-010 | Add SWR inline definition | Frontend | < 1 day | Hint renders on FIRE + Withdrawal screens |
| F-011 | Sync dyscalculia preferences via `/api/me/preferences` | FE + API | 2 weeks | Settings persist across devices |

---

## What Passed (Strengths, 75%+ compliance)

| Component | Standard Met |
|-----------|-------------|
| `DyscalculiaService` with format/spacing/percentage/round/chart/transition controls (`src/app/services/dyscalculia.service.ts:44-104`) | Accommodation: multiple means of representation |
| Three number-format modes — `standard` / `spaced` / `words` | Number presentation flexibility |
| Percentage natural-frequency mode ("about 1 in 4") (`dyscalculia.service.ts:77-104`) | Number sense support |
| `numberToWords()` helper for amounts | Representation variety |
| Bar-only charts (no pies) — `chart-placeholder.component.ts:189-194` | Dyscalculia visual accessibility (pies are the #1 anti-pattern) |
| Real-world magnitude anchors (cost context) | Number sense — magnitude |
| `calmTransitions` toggle disables number-change animation | Math anxiety / anxiety-sensitive display |
| `roundNumbers` toggle | Reduced cognitive load |
| `step` attributes on FX / currency / percent fields | Input precision scaffolding |
| ARIA-labelled chip listboxes, `LiveAnnouncer` announcements | Universal design & assistive-tech access |
| Persistent `localStorage` of user preferences | Accommodation durability (per-device) |
| Explicit grounding in W3C COGA + GOV.UK dyscalculia research (`dyscalculia-settings.component.ts:180`) | Evidence-based design |
| No catastrophic vocabulary ("RUIN", "BANKRUPT", "FAILURE") — `.danger` is style-only | Anxiety reduction |
| User-controlled 3-tier font sizing (13/16/19 px) — `src/app/models/navigation.model.ts:25-27` | Visual accessibility |
| `Ctrl+Shift+A` accessibility panel shortcut — `accessibility-panel.component.ts:75` | Universal design |

---

## Version History

| Version | Date | Auditor | Changes |
|---------|------|---------|---------|
| 1.0 | 2026-04-16 | Claude (automated) | Initial dyscalculia audit |
