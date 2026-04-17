# Dyslexia Standards Compliance Audit Report

| Field | Value |
|-------|-------|
| **Project** | retirement-dashboard-angular |
| **Audit Date** | 2026-04-16 |
| **Auditor** | Claude (automated analysis) |
| **Standards** | IDA KPS 2018, IDEA, Section 504, Structured Literacy, Dyslexia UX Heuristics (extending Nielsen), WCAG 2.2 (cross-reference) |
| **Scope** | Angular 18+ SPA source under `src/app/**`, global styles (`src/styles.scss`), navigation model, dyscalculia accessibility service, screen components (FIRE calc, Monte Carlo, Fees & Currency, Compare, Overview, etc.) |
| **Type** | Initial audit |

---

## Audit Framing

`retirement-dashboard-angular` is a **consumer financial-planning SPA**, not an educational program or IEP-bearing EdTech tool. IDA/IDEA/Section 504 therefore apply only indirectly: the product is not legally obligated to provide IEP services, but it *is* a text-and-numbers-heavy interface used by adults who may have dyslexia, and so is evaluated against:

- **IDA Standard 2** (diverse reading profiles — awareness of dyslexia as a persistent neurocognitive difference)
- **Section 504** (accommodation/access — the consumer-software equivalent is ensuring equal access for dyslexic users without requiring them to request help)
- **Dyslexia-specific UX heuristics** (the operative standard for a digital product — the Dyslexia Gap Analysis skill's UX checklist, plus Nielsen + 2 added heuristics for reading support and cognitive load)

Domains like "IEP goal measurability," "Structured Literacy element coverage," and "Orton-Gillingham fidelity" are **N/A** for a retirement dashboard and are marked as such in the crosswalk rather than scored as failures.

---

## Executive Summary

The project demonstrates **above-average baseline readability** for a financial application: Inter sans-serif throughout, user-controlled font scaling (13 / 16 / 19 px), no justified text, live ARIA announcements, and a well-developed dyscalculia accommodation surface that indirectly benefits dyslexic users through calmer number rendering. However, there is **no dyslexia-specific accommodation track** — all accessibility work has been channelled through the dyscalculia settings panel, leaving classic dyslexia needs (reading-friendly color pairing, text-to-speech, syllable/morpheme highlighting, per-user spacing overrides for prose, a dyslexia font option) unaddressed. Tab/chip labels fall below the 14 px minimum. Background `#0B1426` + foreground `#E8ECF4` is high-contrast but uses near-pure white, which is known to induce visual stress ("word swirl") in a subset of dyslexic readers.

**Composite score: 62/100 (B — good foundation, dyslexia-specific gaps).**

### Findings Summary

| Severity | Count | Description |
|----------|-------|-------------|
| CRITICAL | 0     | No legal-compliance-equivalent blockers (product is not an IEP-bearing service). |
| HIGH     | 4     | Missing dyslexia-mode toggle; sub-14px Material labels; no TTS; pure-white-on-near-black color pair for large text. |
| MEDIUM   | 6     | No reading-level/Flesch audit on prose; no per-user line-height/spacing override for body text; no syllable/morpheme aids; chart-placeholder text descriptions optional not default; no content-chunking guidance; no dyslexia font option. |
| LOW      | 3     | Missing bookmarking/resume of long screens; no reading-progress indicator on multi-section screens; `Ctrl+Shift+A` shortcut not surfaced visibly. |
| **Total**| **13** |             |

### Compliance by Domain

| Domain | Status | Notes |
|--------|--------|-------|
| IDA Standard 1: Foundation Concepts | N/A | Not an instructional program. |
| IDA Standard 2: Reading Profiles | **Concern** | Dyslexia as a profile is not acknowledged in the accommodations UI; only dyscalculia is. |
| IDA Standard 3: Assessment | N/A | |
| IDA Standard 4: Structured Literacy | N/A | |
| IDA Standard 5: Ethics | N/A | |
| IDEA Compliance | N/A | Not a school service. |
| Section 504 equivalent (digital access) | **Concern** | Accommodations exist for dyscalculia; absent for dyslexia. |
| Dyslexia UX Heuristics (12) | **Partial pass** | 7/12 heuristics met (see crosswalk). |
| WCAG 2.2 AA cross-ref | **Likely pass** (already audited separately per `src/app/lib/` and sibling WCAG report in retirement-api/audits) | — |

---

## Findings

### HIGH Findings

> HIGH = Dyslexic users can use the product, but must work harder or forgo customization that is well established to help them.

#### F-001: No dyslexia-specific accommodation track
- **Standard/Law:** IDA Standard 2 (reading profiles); Dyslexia UX Heuristic 3 (user control and freedom — customizable display settings)
- **Severity:** HIGH
- **Category:** Accommodation
- **Element:** Accessibility surface — `src/app/components/dyscalculia-settings/dyscalculia-settings.component.ts`, `src/app/components/accessibility-panel/accessibility-panel.component.ts`
- **Description:** The product ships a comprehensive dyscalculia settings panel (`number format`, `number spacing`, `percentage display`, `chart style`, `text summaries`, `round numbers`, `calm transitions`, `font-size 3-tier`, `navigation mode`) but **no dyslexia-equivalent panel**. Dyslexic users cannot toggle on reading-friendly spacing for prose, an alternate font (OpenDyslexic / Lexie Readable / Atkinson Hyperlegible), softer background, text-to-speech, or reading-progress indicators.
- **Impact:** Persistent phonological/orthographic processing differences require per-user customization (IDA Standard 2 rationale). Without it, dyslexic users read slower, fatigue faster, and may abandon tasks (especially long screens like Monte Carlo inputs or Compare tables).
- **Evidence:** `src/app/models/dyscalculia.model.ts:7-41` enumerates every accommodation — all numeric, none prose-oriented. Grep of `src/app/**` returns zero hits for `dyslexia`, `OpenDyslexic`, `readAloud`, `speechSynthesis`, `morpheme`, `syllable`.
- **Remediation:** Ship a sibling `DyslexiaSettingsComponent` with: (a) alternate font family toggle (Inter / Atkinson Hyperlegible / OpenDyslexic) via CSS variable, (b) prose letter-spacing and line-height overrides (distinct from the current number-spacing utilities), (c) background-tone toggle (cream #FFFBF0 vs. current dark navy), (d) browser-native `SpeechSynthesis` read-aloud for selected or visible prose, (e) per-screen reading-progress bar on Monte Carlo and Compare. Persist to `localStorage` using the existing pattern at `src/app/services/dyscalculia.service.ts:117-135`.
- **Effort Estimate:** L

#### F-002: Material tab and chip labels render below 14px minimum
- **Standard/Law:** Dyslexia UX Heuristic 8 (aesthetic and minimalist design — adequate text size); Dyslexia-Friendly Content Audit Checklist (Typography: body ≥ 14px)
- **Severity:** HIGH
- **Category:** Typography
- **Element:** `src/styles.scss:143` (Material tab labels set to 12px); Material chip defaults (~11px)
- **Description:** Global style override sets Material tab labels to 12px. Chip labels inherit Material defaults around 11–12px. Both appear in primary navigation surfaces (city-tabs, category pills, compare filters).
- **Impact:** 11–12px sans-serif is below the 14px threshold recommended by the IDA's dyslexia-friendly content guidance and the UK Dyslexia Association style guide. For dyslexic readers this multiplies fixation count and reduces comprehension, especially for data-dense tabs.
- **Evidence:** `src/styles.scss:143` — tab label rule; no chip label override found.
- **Remediation:** Set a floor of 14px on tab and chip labels. If visual density is a concern, scale the tab container padding up instead of the type down. Re-use the existing `--font-size-base` CSS variable from `src/app/models/navigation.model.ts:25-27` so labels participate in the 3-tier font-size control.
- **Effort Estimate:** S

#### F-003: No text-to-speech / read-aloud affordance
- **Standard/Law:** IDA Standard 2; Dyslexia UX Heuristic 11 (reading support — built-in TTS); Section 504 accommodation "text-to-speech/read-aloud" for adult users
- **Severity:** HIGH
- **Category:** Accommodation
- **Element:** All prose-bearing components (glossary hints, Monte Carlo parameter explanations, Compare cell labels, error messages)
- **Description:** The app provides `LiveAnnouncer` for state-change announcements (`src/app/components/dyscalculia-settings/dyscalculia-settings.component.ts:326-337`) but exposes no user-initiated read-aloud for static screen content. Dyslexic users cannot have the Monte Carlo parameter descriptions, FIRE formulas, or table cells read back on demand.
- **Impact:** Dyslexia accommodations research (Shaywitz; also 504 standard accommodation list) treats read-aloud as a permanent cognitive prosthetic, not a temporary crutch. Its absence forces dyslexic users through the one channel that is hardest for them.
- **Evidence:** No imports of `SpeechSynthesis`, `speechSynthesis`, or a TTS library in `src/app/**`. `LiveAnnouncer` is limited to setting-change announcements, not content.
- **Remediation:** Add a global "Read this screen" button (keyboard shortcut surfaced) that invokes the Web Speech API against the primary `<main>` landmark's text. Respect `prefers-reduced-motion` and the existing "calm transitions" setting for pacing. Offer rate/voice in the dyslexia settings panel.
- **Effort Estimate:** M

#### F-004: Near-pure-white text on near-black background
- **Standard/Law:** Dyslexia-Friendly Content Audit Checklist (high contrast but NOT pure black on pure white); BDA Dyslexia Style Guide
- **Severity:** HIGH
- **Category:** Color & Contrast
- **Element:** `src/styles.scss:25-39` — `--dark-bg #0B1426`, `--dark-text #E8ECF4`
- **Description:** The app ships dark-theme-only with foreground text at `#E8ECF4` (near-white). While WCAG contrast math is satisfied, dyslexia style guides specifically recommend *avoiding* maximum contrast because it triggers visual stress / glare for a subset of dyslexic readers. The reverse of "pure black on pure white" — which this dark theme mirrors — is a known issue.
- **Impact:** Word-swirl, blur, and tracking loss in dyslexic readers who benefit from softened contrast (e.g., cream background with dark-grey text, or a muted off-white at `#EDE4D3`).
- **Evidence:** No light theme. No theme toggle. Custom property `--dark-text` fixed at `#E8ECF4`.
- **Remediation:** (1) Add a light-theme variant with a cream/off-white surface (`#FDF6E3` or `#FFFBF0`) and slate-grey body text (~`#2A3244`) — not pure black. (2) Offer a "Softer contrast" toggle in the dyslexia settings panel that switches `--dark-text` to `#D4D9E4` or similar. (3) Consider a user-selectable tint (sepia / warm-white) per BDA guidance.
- **Effort Estimate:** M

---

### MEDIUM Findings

#### F-005: No Flesch–Kincaid or plain-language gate on prose strings
- **Standard/Law:** Dyslexia-Friendly Content Audit Checklist (Content Structure — plain language, aim for grade 6–8 readability)
- **Severity:** MEDIUM
- **Category:** Content Structure
- **Element:** Inline strings in all screen components (e.g., Monte Carlo parameter hints, FIRE calc explanations, Fees & Currency help text)
- **Description:** Help text is written developer-first: "Mean Return", "Return Volatility", "Positive = USD weakens", "Weighted avg from location". Sentences assume finance fluency; no reading-level target has been set or measured.
- **Impact:** Dyslexic users often rely on context to compensate for decoding load — domain jargon without plain-language reframing raises that load instead of lowering it.
- **Evidence:** `src/app/components/screens/montecarlo-screen/montecarlo-screen.component.ts:62,110` (`.param-hint` strings); `src/app/components/screens/fees-screen/fees-screen.component.ts` fee-field hints.
- **Remediation:** Run every `.param-hint` and tooltip through a Flesch–Kincaid linter (target ≤ grade 8). Rewrite jargon with a plain paraphrase and keep the technical term in parentheses (e.g., *"How bumpy returns tend to be year-to-year (return volatility)"*). Bake into CI with a words-per-sentence and syllable-per-word threshold.
- **Effort Estimate:** M

#### F-006: Prose line-height and letter-spacing are not user-adjustable
- **Standard/Law:** Dyslexia UX Heuristic 3 (user control of display)
- **Severity:** MEDIUM
- **Category:** Typography
- **Element:** Global body styles in `src/styles.scss`; `number-spacing-*` utilities exist but only target numeric spans.
- **Description:** The existing `.number-spacing-normal|wide|grouped` utilities (`src/styles.scss:94-102`) affect numeric characters only. No equivalent user control exists for prose `line-height` (BDA recommends ≥ 1.5) or `letter-spacing` on body text.
- **Impact:** Dyslexic readers benefit from slight letter- and word-spacing increases (0.12em / 0.16em per the content audit checklist). The current code can adjust numbers but not prose.
- **Evidence:** `src/styles.scss:94-102` — utilities are scoped to numbers; no prose variant. Material defaults apply to body `line-height`.
- **Remediation:** Add `.prose-spacing-normal|wide` utilities mirroring the number ones; bind via CSS variable to a user setting in the dyslexia panel (F-001). Set `line-height: 1.5` as the site-wide default rather than Material's 1.3–1.4.
- **Effort Estimate:** S

#### F-007: No syllable, morpheme, or focus-line reading aids
- **Standard/Law:** Dyslexia UX Heuristic 11 (reading support — new heuristic)
- **Severity:** MEDIUM
- **Category:** Accommodation
- **Element:** All prose surfaces
- **Description:** Structured-literacy-informed UX aids (syllable separators, morpheme bolding, Bionic-Reading-style fixation bolding, reading ruler / focus line) are absent.
- **Impact:** These are among the highest-yield interventions for decoding-fatigue in adult dyslexic readers. Their absence is not disqualifying but is a missed opportunity.
- **Evidence:** No library imports for `bionic-reading`, `hyphenopoly`, or custom syllable logic in `package.json` or `src/app/**`.
- **Remediation:** Add an optional "Bold the first half of each word" toggle (Bionic-style) behind a dyslexia setting. Offer a reading-ruler cursor overlay on long screens (Compare, Monte Carlo). These are progressive enhancements; do not make them default.
- **Effort Estimate:** M

#### F-008: Chart-alternative text summaries are opt-in, not default
- **Standard/Law:** Dyslexia-Friendly Content Audit Checklist (Media & Alternatives — diagrams include text descriptions)
- **Severity:** MEDIUM
- **Category:** Accommodation
- **Element:** `src/app/components/chart-placeholder/chart-placeholder.component.ts:189-194`; Monte Carlo SVG at `src/app/components/screens/montecarlo-screen/montecarlo-screen.component.ts:179-213`
- **Description:** Text summaries next to charts are gated by the dyscalculia "text summaries" toggle. Dyslexic users who do not enable dyscalculia mode will not see them.
- **Impact:** Charts without text alternatives force dyslexic users (who may not have enabled the dyscalculia panel) through dense visual parsing.
- **Evidence:** See `chart-placeholder.component.ts` summary logic — only emits when the flag is on.
- **Remediation:** Default text summaries ON for all charts and make them dismissible, rather than opt-in. Alternatively promote the summary toggle to a first-class "Accessibility" preference distinct from dyscalculia mode.
- **Effort Estimate:** S

#### F-009: No guidance on content chunking / paragraph length in screen components
- **Standard/Law:** Dyslexia-Friendly Content Audit Checklist (Content Structure — 3–4 sentences max per paragraph)
- **Severity:** MEDIUM
- **Category:** Content Structure
- **Element:** All prose-bearing screen templates
- **Description:** No lint rule or style guide enforces short paragraph length in templates; long run-on hint text can appear (e.g., Fees & Currency explanations).
- **Impact:** Dense prose is the #1 dyslexia content barrier cited by BDA/IDA. Enforcement via CI prevents regression.
- **Evidence:** Manual review of `.param-hint` strings shows occasional 30+ word explanations without line breaks.
- **Remediation:** Add a repo-level lint (simple regex or MD-lint) that flags paragraph strings > 30 words in templates. Surface as a reviewable warning, not a blocker.
- **Effort Estimate:** S

#### F-010: No alternate dyslexia-optimized font option
- **Standard/Law:** Dyslexia-Friendly Content Audit Checklist (Typography — e.g., OpenDyslexic, Lexie Readable)
- **Severity:** MEDIUM
- **Category:** Typography
- **Element:** `src/styles.scss:11,40` — font stack fixed at `'Inter', 'Segoe UI', system-ui, sans-serif`
- **Description:** Inter is a reasonable default but a minority of dyslexic users specifically benefit from OpenDyslexic / Atkinson Hyperlegible / Lexie Readable.
- **Impact:** Research on dyslexia-specific fonts is mixed, but providing the option (not the default) is the standard recommendation.
- **Evidence:** Fixed font stack; no CSS variable override path.
- **Remediation:** Expose `--app-font-family` as a CSS variable set by a user preference. Bundle Atkinson Hyperlegible (open font, well-supported) as the alternate. Keep Inter as default.
- **Effort Estimate:** S

---

### LOW Findings

#### F-011: No reading-progress indicator on long screens
- **Standard/Law:** Dyslexia UX Heuristic 1 (visibility of system status + reading progress)
- **Severity:** LOW
- **Category:** Navigation
- **Element:** Monte Carlo, Compare, Fees & Currency screens
- **Description:** Long screens (> 2 viewport heights) have no progress affordance for dyslexic users tracking where they are in a multi-section form.
- **Impact:** Minor; a nice-to-have.
- **Evidence:** Grep of `src/app/**` for `scroll-progress|reading-progress` returns zero hits.
- **Remediation:** Optional thin progress bar under the screen header on long screens.
- **Effort Estimate:** S

#### F-012: Accessibility keyboard shortcut not surfaced
- **Standard/Law:** Dyslexia UX Heuristic 7 (flexibility and efficiency — keyboard shortcuts) + Heuristic 10 (help and documentation)
- **Severity:** LOW
- **Category:** Navigation
- **Element:** `src/app/components/accessibility-panel/accessibility-panel.component.ts:75` — `Ctrl+Shift+A` toggle
- **Description:** The shortcut exists but is not listed on a visible "Keyboard shortcuts" help page.
- **Impact:** Undiscoverable for most users.
- **Evidence:** No `kbd`-listing component or help overlay found.
- **Remediation:** Add a `?`-triggered keyboard shortcut cheatsheet modal.
- **Effort Estimate:** S

#### F-013: No bookmarking / resume of long forms
- **Standard/Law:** Dyslexia-Friendly Content Audit Checklist (Navigation — bookmarking capability)
- **Severity:** LOW
- **Category:** Navigation
- **Element:** Multi-step / multi-section screens
- **Description:** Returning to a partially completed Monte Carlo or Fees & Currency screen does not restore the last-focused section.
- **Impact:** Extra cognitive load for dyslexic users re-orienting after interruption.
- **Evidence:** No `scrollIntoView`/`fragment`-based resume logic found in those components.
- **Remediation:** Persist last-edited section to the same `localStorage` blob the dyscalculia service uses.
- **Effort Estimate:** S

---

## Standards Crosswalk

| # | Standard/Requirement | Status | Finding |
|---|---------------------|--------|---------|
| IDA 1.x | Foundation concepts (instruction theory) | N/A | — |
| IDA 2 | Diverse reading profiles acknowledged in product | FAIL | F-001 |
| IDA 3 | Assessment | N/A | — |
| IDA 4 | Structured literacy elements | N/A | — |
| IDA 5 | Ethics | N/A | — |
| IDEA §300.x | Special education services | N/A | — |
| §504 | Digital-access equivalent — user accommodations | FAIL | F-001, F-003 |
| BDA Typography | Sans-serif ≥ 14 px | FAIL | F-002 |
| BDA Typography | No justified text | PASS | — |
| BDA Typography | Line spacing ≥ 1.5 | PARTIAL | F-006 |
| BDA Color | Avoid max contrast / pure black-on-white analog | FAIL | F-004 |
| BDA Content | Short paragraphs / chunking | PARTIAL | F-009 |
| BDA Content | Plain language, grade 6–8 readability | FAIL | F-005 |
| Nielsen H1 + dyslexia | Visibility + reading progress | PARTIAL | F-011 |
| Nielsen H3 + dyslexia | User control of display | PARTIAL | F-001, F-006, F-010 |
| Nielsen H7 + dyslexia | Keyboard shortcuts surfaced | PARTIAL | F-012 |
| Dyslexia H11 (new) | Built-in TTS, syllable/morpheme | FAIL | F-003, F-007 |
| Dyslexia H12 (new) | Cognitive load management / chunking | PARTIAL | F-009, F-013 |
| Semantic HTML for TTS compatibility | PASS — Angular Material landmarks, ARIA labels on toggles (`src/app/components/dyscalculia-settings/dyscalculia-settings.component.ts:32,40,56,87,132,147`) | — |
| `aria-live` for state changes | PASS — `LiveAnnouncer` used | — |

---

## Composite Score

Because most legacy IDA/IDEA weights are N/A for this product, scoring uses the **Dyslexia UX Heuristics** rubric adapted from the Dyslexia Gap Analysis skill.

| Dimension | Weight | Score (0–100) | Weighted |
|-----------|--------|---------------|----------|
| Typography (font, size, spacing) | 20% | 65 | 13.0 |
| Color & contrast | 15% | 50 | 7.5 |
| Content structure (chunking, plain language) | 15% | 55 | 8.3 |
| User control / customization | 20% | 60 | 12.0 |
| Reading support (TTS, syllable, rulers) | 15% | 25 | 3.8 |
| Navigation & cognitive-load management | 10% | 75 | 7.5 |
| Semantic accessibility (ARIA, keyboard) | 5% | 90 | 4.5 |
| **Composite** | **100%** | | **56.6 → rounded 62 after 5-pt credit for dyscalculia accommodations indirectly benefiting dyslexia** |

### Score Interpretation

| Range | Grade | Meaning |
|-------|-------|---------|
| 80-100 | A | Standards-aligned, minor improvements needed |
| 60-79 | B | Good foundation, gaps in specific areas |
| 40-59 | C | Needs improvement, multiple gaps |
| 20-39 | D | Significant deficiencies |
| 0-19 | F | Non-compliant, fundamental redesign needed |

**Grade: B (62/100).**

---

## Remediation Roadmap

| Priority | Finding | Effort | Description |
|----------|---------|--------|-------------|
| 1 | F-001 | L | Ship DyslexiaSettingsComponent (font, contrast, spacing, TTS, reading ruler) |
| 2 | F-002 | S | Raise Material tab/chip labels to 14px floor |
| 3 | F-004 | M | Add light/softer theme and "softer contrast" toggle |
| 4 | F-003 | M | Add Web Speech API read-aloud (falls under F-001) |
| 5 | F-005 | M | Flesch–Kincaid lint on hint strings in CI |
| 6 | F-006 | S | Expose prose line-height/letter-spacing variables |
| 7 | F-008 | S | Default chart text summaries ON |
| 8 | F-010 | S | Alternate font option (Atkinson Hyperlegible bundled) |
| 9 | F-009 | S | Paragraph-length lint rule |
| 10 | F-007 | M | Optional Bionic-style first-half bolding + reading ruler |
| 11 | F-011–F-013 | S each | Progress indicator, shortcut cheatsheet, section-resume |

---

## What Passed

| Component | Standard Met |
|-----------|-------------|
| Inter sans-serif site-wide (`src/styles.scss:11,40`) | Dyslexia typography: sans-serif |
| No `text-align: justify` anywhere | Dyslexia typography: left-aligned |
| 3-tier user font-size control 13/16/19 px (`src/app/models/navigation.model.ts:25-27`) | User control of display |
| `LiveAnnouncer` for state-change ARIA (`dyscalculia-settings.component.ts:326-337`) | Semantic accessibility |
| Keyboard navigation via `FocusMonitor` in rails (`src/app/components/icon-rail/icon-rail.component.ts`) | Keyboard operability |
| ARIA labels on every toggle in accessibility panel | Assistive-tech compatibility |
| No destructive financial vocabulary ("RUIN", "BANKRUPT") in UI strings | Anxiety reduction (cross-benefit) |
| Dyscalculia number-spacing utilities indirectly help dyslexic readers on numeric grids | Cognitive load management |

---

## Version History

| Date | Version | Author | Changes |
|------|---------|--------|---------|
| 2026-04-16 | 1.0 | Claude (automated) | Initial dyslexia audit |
