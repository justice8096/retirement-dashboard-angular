# Dyslexia Compliance Audit — retirement-dashboard-angular

| Field | Value |
|-------|-------|
| **Project** | retirement-dashboard-angular |
| **Audit Date** | 2026-05-09 |
| **Auditor** | Claude Opus 4.7 (1M context) — automated analysis |
| **Standards** | dyslexia-support-skill v1.3 (cognitive-disorder reframe), IDA KPS 2018 (Standard 1 only — clinical framing), ADA Title III (public accommodation), WCAG 2.2, BDA Dyslexia Style Guide 2018, Dyslexia UX Heuristics (gap-analysis SKILL.md §"Dyslexia UX Heuristics"), Cognitive-Prosthetics Maturity Model (remediation-strategies SKILL.md §"Bypass vs. Remediation Balance") |
| **Scope** | Full re-audit. Compares against 2026-04-21 (composite 92/100, A) and 2026-04-24 gap analysis. Inputs: `src/styles.scss`, `src/index.html`, `src/app/services/dyslexia.service.ts`, `src/app/models/dyslexia.model.ts`, `src/app/components/{accessibility-panel,dyslexia-settings,help-panel,read-aloud-button,shortcut-cheatsheet,onboarding,stat-card,source-tooltip,chart-placeholder}/`, all `src/app/components/screens/**`. ~50 PRs landed since 2026-04-21 (Mortgage, Rental Schedule E, LTC + Medicaid spend-down, Life Events framework, FX stress widget, Roth LTCG harvesting). |
| **Context** | `--context=public-accommodation` — consumer-facing financial-planning web app. ADA Title III applies. K-12 IDEA / IEP / 504 are N/A. Structured-literacy fidelity (IDA Standards 2–5) is N/A — this is not reading instruction. |
| **Type** | Re-audit (4th). Prior reports: 2026-04-19 (B/62), 2026-04-20 (A/93), 2026-04-21 (A/92). |

---

## Executive Summary

**Composite: 89/100 (B+) — three-point regression from 92/100 (A).** The dashboard remains the strongest dyslexia-aware financial-planning surface this auditor has reviewed: 4 dyslexia-typeface families wired through CSS-variable plumbing (`styles.scss:48-55`), four contrast modes including BDA-recommended cream/sepia (`styles.scss:104-124`), Web-Speech-API TTS with rate control, reading ruler, reading-progress bar, plain-language per-screen help, glossary chips, shortcut cheatsheet, systemic `:focus-visible` outline (`styles.scss:399-407`). Three carry-over LOWs from 2026-04-19 close (OpenDyslexic 700 weight is in `index.html:22`, focus-visible global is in `styles.scss:399`, climate/healthcare-compare color-only fixes shipped via `.sr-only` at `styles.scss:382-392`). Three NEW findings open in the post-2026-04-21 surface area — the Life Events Timeline SVG (`mc-life-events-timeline`) ships 9px axis labels with no `aria-label` on the parent `<svg>`, the LTC + Mortgage + Rental + Life Events sub-components import zero dyslexia affordances, and the new FX stress widget italicizes a body-grade disclaimer (`location-detail.component.scss:188-194`). The 2026-04-24 gap-analysis "must-ship" trio — wire `bionicSegments()`, promote dyslexia-lite to baseline, add TTS pause/resume — remains entirely unshipped.

**Cognitive-disorder framing (per skill v1.3).** Dyslexia is a persistent neurodevelopmental processing difference (Shaywitz phonological-deficit theory; Dehaene VWFA; Gabrieli left-temporoparietal architecture) — not a temporary reading gap. For a consumer financial app under ADA Title III, the operative obligation is **lifelong cognitive prosthetics**, not remediation. The dashboard satisfies the prosthetic surface (TTS, dyslexic fonts, contrast modes, spacing tiers, ruler) at the *opt-in* layer but fails the *default* layer: a self-identified-but-not-onboarded dyslexic visitor who lands on `/montecarlo` gets Inter at 1.5× line-height with no 70ch clamp, no focus assistance beyond browser default, and no awareness that any of these affordances exist until they discover `Ctrl+Shift+A`. The skill's "bypass vs. remediation" framing maps cleanly: every prosthetic in this app is bypass-track (correct for a financial product), but they are gated behind a discovery wall that defeats their purpose for the audience that needs them most.

**Net findings: 3 NEW (1 MEDIUM, 2 LOW). 3 prior findings CLOSED. 7 carry-over OPEN (3 from gap-analysis "must" tier + 4 prior compliance gaps).**

---

## Remediation Status (vs. 2026-04-21)

| ID | Finding | Severity | Status | Evidence |
|---|---|---|---|---|
| DFA-2026-04-19-006 | OpenDyslexic 400-only bundle | LOW | **FIXED** | `index.html:21-22` ships 400 + 700 from `@fontsource/opendyslexic@5.1.0`. |
| DFA-2026-04-19-007 | Read-aloud lacks pause/resume | LOW | **REMAINING** | `read-aloud-button.component.ts:79-96` — still binary. `dyslexia.service.ts:102-122` — no `pauseReading`. |
| DFA-2026-04-19-008 | Reading progress bar default-off | LOW | **PARTIALLY FIXED** | Default still `false` (`dyslexia.model.ts:43`), but `toggle()` auto-flips it on first enable (`dyslexia.service.ts:51-72`). Mitigation accepted. |
| DFA-2026-04-21-001 | Sub-11px axis/legend/badge text | MEDIUM | **PARTIALLY FIXED** | `climate`, `healthcare-compare`, `sankey` axis text raised. `.badge-new` still 10px in `fees-screen.component.scss:4` (acceptable per cosmetic carve-out). NEW 9px instances appear in `mc-life-events-timeline` and `mc-scenarios` — re-opened as DFA-2026-05-09-001. |
| DFA-2026-04-21-002 | Climate / Healthcare color-only cells | LOW | **FIXED** | `.sr-only` utility added at `styles.scss:382-392`. Climate hot/cold and HC quality cells now carry sr-only text labels per the prior audit's fix. |
| DFA-2026-04-21-003 | Sankey SVG double-read | LOW | **FIXED** | Sankey component now uses `<title>` only with `aria-hidden="true"` on visible `<text>` (verified by grep — no double-read pattern in current Sankey). |
| DFA-2026-04-21-004 | Focus-visible replacement | LOW | **FIXED** | `styles.scss:399-407` — global `:focus-visible { outline: 2px solid var(--dark-amber); outline-offset: 2px; }`. Catches keyboard focus across all custom inputs. |

**Summary: 4 FIXED, 1 PARTIALLY FIXED (with mitigation), 1 PARTIALLY FIXED (re-opened in new code), 1 REMAINING.**

### Carry-over from 2026-04-24 Gap Analysis (unchanged)

| ID | Finding | Status |
|---|---|---|
| DGA-2026-04-24-001 | Retroactive accessibility — every accommodation gated on master toggle | OPEN — no shipped change |
| DGA-2026-04-24-002 | No personalized accommodation engine / preset picker | OPEN — no shipped change |
| DGA-2026-04-24-003 | `bionicSegments()` defined but zero render call sites (dead code) | OPEN — `Grep "bionic-text"` still returns only `styles.scss:213` |
| DGA-2026-04-24-004 | Italics on body-grade prose (chart-placeholder, stat-card, source-tooltip, mc-scenarios, mc-results, location-overview, location-detail, location-compare, neighborhoods, roth, services, taxes, montecarlo, mc-life-events-timeline, **+cost-detail, +localinfo, +mc-life-events, +estate, +assumptions**) | OPEN — count grew from 6 files to 19 |
| DGA-2026-04-24-005 | `text-transform: uppercase` on labels — 14 files | OPEN — count grew to 30 files / 45 occurrences (verified by grep) |
| DGA-2026-04-24-006 | "Lexie Readable" font option falls through to Atkinson (no `<link>`) | OPEN — `index.html:17-22` has Atkinson, Inter, Lexend, OpenDyslexic; no Lexie. `dyslexia.model.ts:73` still references `'Lexie Readable'`. |
| DGA-2026-04-24-007 | Line-height tiers cap at 1.8 (Rello & Baeza-Yates support 2.0 for severe phonological profiles) | OPEN — `dyslexia.model.ts:47-51` still `normal:1.4, relaxed:1.6, loose:1.8` |

---

## Before/After Score Delta

| Dimension | Weight | 2026-04-21 | 2026-05-09 | Δ | Driver |
|---|---|---|---|---|---|
| BDA Typography | 20% | 92 | 88 | −4 | New 9px sub-component text (mc-life-events, mc-scenarios); italics count grew 6→19 files. |
| BDA / WCAG Color & Contrast | 15% | 93 | 95 | +2 | DFA-2026-04-21-002 fixed (sr-only); cream/light/softer-dark contrast modes unchanged. |
| BDA / GOV.UK Plain Language | 15% | 90 | 88 | −2 | New screens (Mortgage, LTC, Life Events, Rental Schedule E) added without help-panel entries surveyed; technical density up. |
| WCAG 1.4 spacing / reflow / resize | 15% | 95 | 95 | 0 | 70ch clamp + tiered line-height unchanged. |
| User control / customisation | 15% | 95 | 90 | −5 | Settings UI unchanged, but feature scope grew (10+ new screens) without proportional accommodation surface. Discovery gap widens. |
| Reading support (TTS, bionic, ruler) | 10% | 85 | 78 | −7 | Bionic still dead; TTS still binary; gap-analysis "must" tier (3 items) unshipped after 15 days. Cognitive-prosthetics maturity has stagnated. |
| Navigation & cognitive-load | 5% | 85 | 82 | −3 | New mc-life-events-timeline + FX stress + LTC adds working-memory load on dense MC + Location screens with no chunking aid. |
| Semantic accessibility (ARIA, keyboard) | 5% | 88 | 92 | +4 | DFA-2026-04-21-003 + DFA-2026-04-21-004 fixes; sr-only utility + global focus-visible. |
| **Composite** | **100%** | **92** | **89** | **−3** | |

---

## NEW Findings (2026-05-09)

### DFA-2026-05-09-001 [MEDIUM] — Sub-11px text in new MC sub-components and Life Events Timeline

- **Standard:** WCAG 1.4.4 Resize Text; BDA Style Guide ("avoid font sizes below 12pt"); Dyslexia UX Heuristic #11 (Reading support).
- **Files & lines:**
  - `src/app/components/screens/montecarlo-screen/mc-life-events-timeline/mc-life-events-timeline.component.scss:28-31` — `.axis-label { font-size: 9px; }` (year-tick axis labels).
  - `src/app/components/screens/montecarlo-screen/mc-scenarios/mc-scenarios.component.scss:24-30` — `.tl-cost-proj { font-size: 9px; font-style: italic; }` (timeline cost projection); `.tl-small-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; }` (timeline field labels — quadruple-jeopardy: small + uppercase + letter-spaced + below-floor).
  - `src/app/components/screens/location-overview\location-overview.component.scss:173` — `.anchor-note { font-size: 9px; font-style: italic; }`.
  - `src/app/components/screens/location-detail\location-detail.component.scss:83` — `.bar-anchor { font-size: 9px; font-style: italic; }`.
  - `src/app/components/screens/location-compare\location-compare.component.scss:129,175` — two 9px occurrences.
  - `src/app/components/screens/assumptions-screen\assumptions-screen.component.scss:90` — 9px badge.
  - `src/app/components/screens/taxes-screen\taxes-screen.component.ts:152` — 9px tax-bracket badge.
  - `src/app/components/screens/neighborhoods-screen\neighborhoods-screen.component.scss:99` — 9px score-label (uppercase).
- **Impact (cognitive-disorder framing):** Year-axis values on the Life Events Timeline at 9px CSS render at ~6.75pt at default zoom — below the BDA floor of 12pt and the WCAG soft floor of 11px. For a dyslexic reader relying on the visual word form area's letter-shape recognition (Dehaene VWFA pathway), sub-12pt text forces the slower phonological-decoding route. Combined with `.tl-small-label`'s uppercase + letter-spacing (BDA explicitly flags both as recognition barriers), this is the most adversely-stacked typography on the dashboard. Year axes carry quantitative meaning (which simulation-year a Move/inheritance/spouse-death event falls on) — losing them is functional, not cosmetic.
- **Evidence:** Grep `font-size:\s*(8|9)px` returns 11 occurrences; 3 of those (`mc-life-events-timeline:28`, `mc-scenarios:24,30`) are in code shipped after the prior audit (post-#109 Life Events framework batch).
- **Remediation:** Raise all axis/legend/timeline labels to 11px minimum. The `.tl-small-label` styling (uppercase + letter-spacing) should be replaced with sentence-case + a `font-weight: 600` color treatment on the same line — uppercase labels are a BDA-flagged barrier independent of size. Effort: S (one search-replace in 9 files, plus auditing the 30-file uppercase set referenced in DGA-2026-04-24-005).
- **Effort:** S.

### DFA-2026-05-09-002 [LOW] — Life Events Timeline SVG lacks accessible name and lane-color text equivalents

- **Standard:** WCAG 4.1.2 Name, Role, Value; WCAG 1.4.1 Use of Color; ADA Title III "effective communication" (28 CFR §36.303).
- **File:** `src/app/components/screens/montecarlo-screen/mc-life-events-timeline/mc-life-events-timeline.component.html:9-91`.
- **Description:** The `<svg>` element opens without `role="img"`, `aria-label`, or `aria-labelledby`. Each marker has `<title>` (good — names individual events) but no element provides the *chart's overall purpose* to screen readers, which read the SVG as a stream of titled shapes with no framing. Six lanes are differentiated by `lane.color` only — the lane labels (`.lane-label` text at line 16, 11px) carry the text equivalent, but a 9px year axis combined with color-coded markers means a dyslexic user who has zoomed past 200% loses both axis labels (clipped) and the color discrimination (especially on cream-contrast mode where the lane palette darkens uniformly per `styles.scss:115-124`).
- **Impact (cognitive-disorder framing):** Cognitive-prosthetics maturity (per `remediation-strategies/SKILL.md`) requires that bypass tools be available "as permanent cognitive prosthetics, not temporary scaffolds." The Life Events Timeline replaces what would otherwise be a dense paragraph of "in year 12 you move, in year 15 your spouse dies, in year 18 your inherited-IRA drains" with a chart — a legitimate cognitive prosthetic. But the prosthetic itself is unreachable to screen-reader users and degraded for low-vision dyslexic users on cream contrast.
- **Remediation:**
  1. Add to `<svg>` (line 9): `role="img"` and `[attr.aria-label]="ariaLabelString()"` where `ariaLabelString()` returns e.g. `"Life events timeline. {{moveMarks().length}} moves, {{deathMarks().length}} spouse-death events, {{expenseMarks().length}} one-time expenses, {{incomeMarks().length}} one-time incomes, {{iraSpans().length}} inherited-IRA drains over {{state.years()}} years."`
  2. Add a screen-reader-only `<ul>` after the `<svg>` (use `.sr-only` from `styles.scss:382-392`) listing each event as a structured text fallback.
  3. On `dx-contrast-cream` and `dx-contrast-light`, augment lane markers with shape variants (currently lanes 0/3/4 are all circles; differentiate by stroke pattern or icon).
- **Effort:** S–M.

### DFA-2026-05-09-003 [LOW] — Italics on body-grade disclaimer prose (count regression)

- **Standard:** BDA Dyslexia Style Guide 2018 ("avoid italics — italicized text is harder to read for dyslexic users; use bold or color for emphasis").
- **Files (new since 2026-04-21):**
  - `src/app/components/screens/location-detail\location-detail.component.scss:193` — `.fx-stress-note { font-size: 10px; font-style: italic; }` — disclaimer on the new FX stress widget. The FX widget is a top-of-Location-detail feature added in PR #94.
  - `src/app/components/screens/location-detail\location-detail.component.scss:86` — `.bar-anchor { font-style: italic; }` — bar anchor (citation source).
  - `src/app/components/screens/location-overview\location-overview.component.scss:175` — `.anchor-note { font-style: italic; }`.
  - `src/app/components/screens/cost-detail\cost-detail.component.ts:138` — `.area-line { font-style: italic; }`.
  - `src/app/components/screens/localinfo-screen\localinfo-screen.component.ts:183-184` — `.empty-hint`, `.detail-row.muted .dv` italicized.
  - `src/app/components/screens/montecarlo-screen/mc-life-events-timeline/mc-life-events-timeline.component.scss:36` — `.empty-state { font-style: italic; }`.
  - `src/app/components/screens/montecarlo-screen/mc-results/mc-results.component.scss:15` — `.save-hint { font-style: italic; }`.
  - `src/app/components/screens/estate-screen/estate-screen.component.scss:156` — `.tax-sources-label { font-style: italic; }`.
- **Impact:** 19 files now contain `font-style: italic` on body-grade prose, up from 6 files at the 2026-04-24 gap analysis. The new code shipped after that audit is replicating an anti-pattern the BDA Style Guide explicitly calls out as a dyslexia barrier — italics weaken letter-shape recognition (relevant to Dehaene's VWFA model, where the brain matches against canonical Roman shapes, and italic skewing degrades the match).
- **Remediation:** Global find-replace: `font-style: italic` → `color: var(--dark-text-muted); font-weight: 400` on prose-grade selectors. Alternatively, add `html.dx-enabled .audit-hint, html.dx-enabled .anchor-note, ... { font-style: normal; }` as a single global override in `styles.scss`. Effort: XS for the latter (one CSS rule).
- **Effort:** XS (override) / S (full replacement).

---

## Detailed Findings — Carry-over (open)

### DGA-2026-04-24-001 [MEDIUM] — Retroactive accessibility: every accommodation gated on master toggle

- **Standard:** ADA Title III Effective Communication (28 CFR §36.303); Dyslexia UX Heuristic #8 (Aesthetic and minimalist design — adequate whitespace as default).
- **File:** `src/app/services/dyslexia.service.ts:170-180`, `src/styles.scss:183-196`, `src/app/models/dyslexia.model.ts:33-45`.
- **Description:** All dyslexia-friendly defaults — 70ch line clamp, line-height 1.6, focus-visible (already global per DFA-2026-04-21-004), word/letter spacing — apply only when `html.dx-enabled` is set, which requires the user to discover and toggle the Accessibility Panel. A self-identified dyslexic visitor who lands on the dashboard via Google sees Inter at 1.5× line-height with no clamp, no spacing — the *baseline* is non-accommodating.
- **Impact (cognitive-disorder framing):** Per Shaywitz, ~5–10% of adult readers have dyslexia. The opt-in-only architecture captures only those already self-identifying *and* technically literate enough to discover keyboard shortcuts. ADA Title III's "effective communication" standard is undermined when the accommodation surface is conditional on opt-in.
- **Remediation:** Promote 70ch clamp, line-height 1.6, the global `:focus-visible` outline (already done), and a baseline letter-spacing of 0.01em to `:root` rather than `html.dx-enabled`. Reserve the master toggle for *additive* affordances (OpenDyslexic font swap, ruler overlay, progress bar, TTS FAB).
- **Effort:** XS — move two SCSS selectors. **Highest impact-per-effort change in this audit.**

### DGA-2026-04-24-002 [MEDIUM] — No personalized accommodation engine / preset picker

- **Standard:** Dyslexia UX Heuristic #3 (User control and freedom — customizable display settings); gap-analysis SKILL.md Gap 2.
- **File:** `src/app/components/dyslexia-settings/dyslexia-settings.component.ts:36-…`; `src/app/models/dyslexia.model.ts:8-31` (flat settings, no profile enum).
- **Description:** Settings are 8 independent chip groups with no notion of dyslexia subtype (phonological, surface, mixed, visual stress) and no presets. Users must manually compose 4–6 toggles correctly to land on a useful configuration.
- **Remediation:** 3-preset picker on the Dyslexia tab: "Just widen the text" (line-height 1.6 + 70ch + Atkinson), "Cream + dyslexic font" (cream contrast + OpenDyslexic + spacing wide), "Everything on" (all aids + TTS).
- **Effort:** S.

### DGA-2026-04-24-003 [MEDIUM] — `bionicSegments()` is dead code

- **Standard:** Cognitive-Prosthetics Maturity Model (remediation-strategies SKILL.md §"Bypass vs. Remediation Balance"); Dyslexia UX Heuristic #11 (Reading support — built-in bionic).
- **File:** `src/app/services/dyslexia.service.ts:131-137` (defined); `src/styles.scss:213` (CSS hook). Zero render sites.
- **Description:** The Bionic-bolding helper is shipped, the CSS rule exists, the chip in the settings UI offers `bionic` as a `readingAid` option (`dyslexia.model.ts:5`) — but no template renders `<strong>`-wrapped segments. Selecting "Bionic" in Settings has zero visible effect.
- **Impact:** Marketing the affordance without delivering it is a worse outcome than not advertising it. Cognitive-prosthetics maturity is **broken-promise** at this affordance — the highest-leverage gap-analysis fix.
- **Remediation:** Add a `<app-bionic [text]="...">` standalone component and wire it into `help-panel.component.ts` paragraph rendering and screen `.insights` bullets. The service helper and CSS rule already exist.
- **Effort:** S.

### DGA-2026-04-24-004 [LOW → MEDIUM, escalated] — Italics regression on body-grade prose

See DFA-2026-05-09-003 above for the new regression. Original finding stands; severity escalated from LOW to MEDIUM because the count grew rather than shrank, indicating the anti-pattern is replicating in new code.

### DGA-2026-04-24-005 [LOW] — `text-transform: uppercase` on labels (30 files / 45 occurrences)

- **Standard:** BDA Dyslexia Style Guide 2018 ("avoid block capitals — they are harder to read because all letters are the same height"); Dehaene VWFA pathway (uppercase forms have less canonical-shape match data than lowercase in adult readers).
- **Evidence:** Grep `text-transform:\s*uppercase` returns 45 occurrences across 30 files. New screens replicate the pattern (mc-scenarios `.tl-small-label`, mc-results `.result-label`).
- **Remediation:** One mixin in `styles.scss`: `@mixin label-tag { font-size: 11px; font-weight: 600; letter-spacing: 0.3px; color: var(--dark-text-muted); /* sentence-case in markup */ }`. Convert 30 files in a follow-up sweep. Or, gate uppercase under `html:not(.dx-enabled)` so dyslexic users see sentence-case automatically.
- **Effort:** M (full sweep) / XS (gate behind `html:not(.dx-enabled)` selector).

### DGA-2026-04-24-006 [LOW] — Lexie Readable font option without `<link>`

- **File:** `src/index.html:14-22` (no Lexie); `src/app/models/dyslexia.model.ts:73` (`lexie: "'Lexie Readable', 'Atkinson Hyperlegible', ...`).
- **Description:** Selecting "Lexie" in the font chip silently falls through to Atkinson because no `@font-face` or `<link>` loads the actual face. User chooses "Lexie", gets Atkinson, has no signal.
- **Remediation:** Either self-host Lexie Readable (it is freely-licensed for personal use; check commercial terms) or remove the option from `DYSLEXIA_FONT_FAMILIES` and the chip.
- **Effort:** XS (remove) / S (host).

### DGA-2026-04-24-007 [LOW] — Line-height tier caps at 1.8

- **File:** `src/app/models/dyslexia.model.ts:47-51`.
- **Description:** Rello & Baeza-Yates (2013) and BDA Style Guide both recommend line-heights up to 2.0 for severe phonological dyslexia profiles. The `loose` tier at 1.8 is short.
- **Remediation:** Add `extra-loose: 2.0` to the enum + token map.
- **Effort:** XS.

### DFA-2026-04-19-007 [LOW] — Read-aloud lacks pause/resume

- **File:** `src/app/components/read-aloud-button/read-aloud-button.component.ts:79-96`; `src/app/services/dyslexia.service.ts:102-122`.
- **Description:** TTS is binary (speak/stop). For long screens (Monte Carlo insights, Tax explainers, Roth conversion ladders), users cannot pause, scroll, and resume. The Web Speech API natively supports `speechSynthesis.pause()` / `.resume()`.
- **Remediation:** Add `pauseReading()` and `resumeReading()` to `DyslexiaService`; expand FAB to 3-state (▶ / ⏸ / ⏹) with state tracking via `speechSynthesis.paused`.
- **Effort:** S.

---

## Composite Score

| Dimension | Weight | Score | Weighted |
|---|---|---|---|
| BDA Typography (font choice, size floor, italics, uppercase) | 20% | 88 | 17.6 |
| BDA / WCAG Color & Contrast (multi-mode, off-pure, color-only) | 15% | 95 | 14.3 |
| BDA / GOV.UK Plain Language (chunking, glossary, complexity) | 15% | 88 | 13.2 |
| WCAG 1.4 spacing / reflow / resize | 15% | 95 | 14.3 |
| User control / customisation | 15% | 90 | 13.5 |
| Reading support / Cognitive prosthetics (TTS, bionic, ruler) | 10% | 78 | 7.8 |
| Navigation & cognitive-load (chunking, predictability) | 5% | 82 | 4.1 |
| Semantic accessibility (ARIA, keyboard, focus-visible) | 5% | 92 | 4.6 |
| **Composite** | **100%** | | **89.4 → 89** |

### Score Interpretation

| Range | Grade | Meaning |
|---|---|---|
| 80–100 | A / A− / B+ | Standards-aligned. 89 = B+ — strong baseline, accumulating debt. |
| 60–79 | B− / C+ | Good foundation, gaps in specific areas |
| 40–59 | C / D | Needs improvement, multiple compliance gaps |

**Grade: B+ (89/100)** — three points down from A (92) on 2026-04-21. The regression is concentrated in Reading support / Cognitive prosthetics (−7 points) and User control / customisation (−5 points). Both reflect the same root cause: the dashboard's accommodation surface scaled at O(1) while the feature surface scaled at O(N) — 50+ PRs of new financial-modeling features without a corresponding accommodation update.

---

## Cognitive-Prosthetics Maturity Model — Status

Per `remediation-strategies/SKILL.md` §"Bypass vs. Remediation Balance" — for a financial app the relevant track is **bypass**. Maturity tiers (auditor-defined, grounded in skill content):

| Tier | Description | Status |
|---|---|---|
| 0 — None | No prosthetics shipped | N/A |
| 1 — Available | Prosthetics exist behind opt-in, discoverable | **CURRENT TIER** |
| 2 — Default-on | Universally-beneficial prosthetics (line-height, focus-visible, 70ch) ship as baseline; additive aids opt-in | Blocked on DGA-2026-04-24-001 |
| 3 — Adaptive | Onboarding detects profile or user picks preset; prosthetics auto-configure | Blocked on DGA-2026-04-24-002 |
| 4 — Interactive | Prosthetics include real-time coaching (syllable breaks on glossary terms, fluency pacing on TTS, bionic) | Blocked on DGA-2026-04-24-003 + DFA-2026-04-19-007 |

The dashboard sits at **Tier 1** and has stagnated there for 18 days. The 2026-04-24 gap analysis named the three changes needed to reach Tier 2 + the start of Tier 4 (bionic wire-up, dyslexia-lite default, TTS pause/resume). All three remain unshipped. This is the single most important framing observation in this audit: the dashboard is *prosthetic-rich at the kit layer and prosthetic-poor at the user layer*.

---

## Remediation Roadmap

| Priority | Finding | Effort | Impact | Tier-Move |
|---|---|---|---|---|
| 1 | DGA-2026-04-24-001 — promote dyslexia-lite to baseline (move 70ch clamp + line-height 1.6 + spacing 0.01em from `html.dx-enabled` to `:root`) | XS | High | 1 → 2 |
| 2 | DGA-2026-04-24-003 — wire `bionicSegments()` into help-panel + screen insights via `<app-bionic>` | S | High | 1 → 4 (partial) |
| 3 | DFA-2026-04-19-007 — TTS pause/resume + 3-state FAB | S | High | 1 → 4 (partial) |
| 4 | DFA-2026-05-09-001 — raise mc-life-events-timeline / mc-scenarios / location anchors to 11px | S | Medium | Closes new MEDIUM |
| 5 | DGA-2026-04-24-002 — 3-preset picker | S | Medium | 2 → 3 |
| 6 | DFA-2026-05-09-002 — Life Events Timeline `aria-label` + sr-only fallback list | S | Medium | Semantic accessibility |
| 7 | DFA-2026-05-09-003 — global italic override under `html.dx-enabled` (or full sweep) | XS / S | Medium | Closes regression |
| 8 | DGA-2026-04-24-005 — uppercase override under `html:not(.dx-enabled)` (or full sweep) | XS / M | Medium | BDA compliance |
| 9 | DGA-2026-04-24-006 — host Lexie Readable or remove option | XS | Low | Removes silent fallthrough |
| 10 | DGA-2026-04-24-007 — add `extra-loose: 2.0` line-height tier | XS | Low | Severe-profile support |

The first three items collectively close the maturity-tier stagnation and would restore the composite score to A range (~93–94/100) on the next audit.

---

## What Passed (≥90 in dimension or notable strength)

| Component | Standard Met | File:Line |
|---|---|---|
| Dyslexic-typeface availability (3 of 4 working) | BDA Style Guide; Dyslexia UX Heuristic #1 | `index.html:17-22` — Atkinson, OpenDyslexic 400+700, Inter, Lexend |
| Multi-contrast modes (4 — softer-dark, cream, light, dark) | BDA "avoid pure white-on-black" | `styles.scss:87-143` |
| Global `:focus-visible` outline | WCAG 2.4.7 + 2.4.11 Focus Appearance | `styles.scss:399-407` |
| `.sr-only` utility for color-only equivalents | WCAG 1.4.1 | `styles.scss:382-392` |
| 70ch prose clamp (when enabled) | BDA "60–80 char line length" | `styles.scss:183-196` |
| Web Speech API TTS with rate control | Cognitive prosthetics — bypass | `dyslexia.service.ts:96-122`; `dyslexia.model.ts:63-67` |
| Reading ruler overlay | Dyslexia UX Heuristic #11 (line tracking) | `styles.scss:220-232`; `app.component.ts` |
| Reading-progress bar (auto-on at first enable) | Dyslexia UX Heuristic #1 (visibility of system status) | `dyslexia.service.ts:51-72` |
| Plain-language per-screen help drawer | GOV.UK plain-language; Dyslexia UX Heuristic #10 | `help-panel.component.ts`, `help-content.ts` |
| Glossary chips with definitions | Dyslexia UX Heuristic #2 (real-world match) | `glossary.service.ts` |
| Shortcut cheatsheet (`?`) | Dyslexia UX Heuristic #7 (flexibility) | `shortcut-cheatsheet.component.ts` |
| LiveAnnouncer integration | WCAG 4.1.3 Status Messages | `dyslexia-settings.component.ts:4` |
| OpenDyslexic 400 + 700 weights | DFA-2026-04-19-006 (now closed) | `index.html:21-22` |
| Sankey accessible-name handling | DFA-2026-04-21-003 (now closed) | `sankey-screen.component.html` |
| 14px floor on Material chips/tabs/buttons | DFA-2026-04-21 audit follow-through | `styles.scss:340-374` |
| Tabular-nums on cost columns (FX widget, location-detail) | Dyscalculia overlap; reduces visual-tracking errors | `location-detail.component.scss:21,113,194` |

---

## Skill-Content Critique

The v1.3 cognitive-disorder reframe **did** come through usefully: the Executive Summary's framing ("persistent neurodevelopmental processing difference, not temporary reading gap") is a sharper rhetorical move than the prior audits' compliance-checklist framing, and the bypass-vs-remediation distinction maps cleanly to a financial app (everything is bypass — no remediation track exists or should). The Cognitive-Prosthetics Maturity Model in `remediation-strategies/SKILL.md` is the most actionable single artifact in the skill — defining tiers (Available → Default-on → Adaptive → Interactive) gave me a way to score the dashboard's stagnation that prior audits couldn't articulate. The Dyslexia UX Heuristics in `gap-analysis/SKILL.md` were directly used as scoring scaffolds.

**Gaps in the skill for this context:**
1. **No public-accommodation–specific audit checklist.** The standards-compliance SKILL has IEP/504 checklists but no equivalent ADA Title III consumer-app checklist. I had to build one inline from BDA + Dyslexia UX Heuristics + the cognitive-disorder framing. A first-class "ADA Title III consumer-app checklist" would slot well next to the existing K-12/higher-ed lists.
2. **The Cognitive-Prosthetics Maturity Model is named but not formally tiered.** The skill describes bypass vs. remediation but does not enumerate maturity tiers. I defined 5 tiers (None / Available / Default-on / Adaptive / Interactive) inline; this should be a first-class artifact in the skill so subsequent audits don't reinvent it.
3. **No quantitative scoring framework.** The audit format spec gives a composite-score template with weights, but the weights themselves (20% typography, 15% contrast, etc.) are auditor-defined. Codifying a default weighting for the consumer-app context would harden delta-comparison across audits.
4. **The italics/uppercase findings were derived from BDA Style Guide, not the skill.** The skill could absorb the BDA-specific micro-rules (no italics, no uppercase, max-line-length 70ch, line-height ≥1.5) into its compliance checklist as the "BDA technical floor."

Net: the v1.3 reframe is the right move — the audit reads more clinically grounded than the 2026-04-21 version, and the maturity-model framing identifies a stagnation pattern the prior compliance-only framing missed entirely.

---

## Version History

| Date | Version | Auditor | Changes |
|---|---|---|---|
| 2026-04-16 | 1.0 | Claude | Initial — B / 62 |
| 2026-04-19 | 2.0 | Claude | 9 findings fixed; A− / 84 |
| 2026-04-20 | 3.0 | Claude | HIGH + all MEDIUM closed; A / 93 |
| 2026-04-21 | 4.0 | Claude | Delta for 11 new + 4 modified; 4 new findings (1 MED, 3 LOW); A / 92 |
| 2026-04-24 | gap-analysis | Claude | Re-frame against ecosystem-gap framework; identified 7 gaps |
| 2026-05-09 | 5.0 | Claude Opus 4.7 (1M) | Re-audit under skill v1.3 cognitive-disorder reframe + ADA Title III public-accommodation context. 3 prior findings closed (DFA-2026-04-19-006, DFA-2026-04-21-003, DFA-2026-04-21-004). 3 new findings (1 MED, 2 LOW). 7 gap-analysis carry-overs OPEN. Cognitive-Prosthetics Maturity = Tier 1 (Available); blocked on DGA-2026-04-24-001/002/003. **B+ / 89.** |
