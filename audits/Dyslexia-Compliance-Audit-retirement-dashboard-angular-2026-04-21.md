# Dyslexia Compliance Audit — Delta

| Field | Value |
|-------|-------|
| **Project** | retirement-dashboard-angular |
| **Audit Date** | 2026-04-21 |
| **Auditor** | Claude (automated analysis) |
| **Type** | Delta re-audit — new screens + modified files shipped 2026-04-20/21 |
| **Baseline** | `Dyslexia-Compliance-Audit-retirement-dashboard-angular-2026-04-20.md` — composite 93/100 (A) |
| **Scope** | 11 new screens, 4 modified screens |

---

## Executive Summary

The 11 new screens are structurally consistent with the baseline. Every new screen uses `font-family: var(--font-sans)` on inputs, `line-height: var(--prose-line-height, 1.5)` on prose blocks, and `overflow-x: auto` `.table-wrap` containers for wide tables. The 70ch `max-width` clamp under `html.dx-enabled` (`src/styles.scss:169-185`) applies to `.param-hint` and `.header-sub` without per-component work.

Three issue clusters are new: sub-11px text in axis/legend/badge elements (4 screens), Sankey SVG node-value labels at 10px with double-read risk, and color-only fallback gaps in Climate and Healthcare Compare tables. The three carry-over LOWs from 2026-04-20 remain open.

**Net new findings: 4 (1 MEDIUM, 3 LOW). No CRITICAL or HIGH.**
**Composite score: 92/100 (A)** — one point regression from 93.

---

## New Findings

### DFA-2026-04-21-001 [MEDIUM] — Sub-11px text across chart elements

- **Standard:** WCAG 1.4.4 Resize Text; BDA font-size guidance
- **Occurrences (`font-size: 10px`):**
  - `climate-screen.component.ts:254,274` — `.y-axis`, `.x-axis`
  - `healthcare-compare-screen.component.ts:275,301,303` — `.y-axis`, `.x-axis`, `.axis-labels`
  - `sankey-screen.component.ts:261` — `.node-value`
  - 8 files — `.badge-new` (cosmetic)
  - `inclusion-screen.component.ts:135` — `.factor`
- **Impact:** Axis ticks and SVG Sankey dollar amounts convey quantitative information. At 10px CSS, ~7.5pt at 100% zoom — below WCAG AA 11px soft floor. Dyslexic users relying on baseline spacing (not the 3-tier upscale) lose axis values.
- **Remediation:** Raise axis/legend/node-value text to 11px across 8 files. `.badge-new` acceptable at 10px if `aria-hidden="true"` added so screen readers skip decorative text.

### DFA-2026-04-21-002 [LOW] — Climate and Healthcare Compare color-only table cells

- **Standard:** WCAG 1.4.1 Use of Color
- **Files:**
  - `climate-screen.component.ts:163,169` — `.hot` / `.cold` classes; numeric temps same text, color-only differentiator
  - `healthcare-compare-screen.component.ts:87-90` — `.q-good` / `.q-mid` / `.q-low` on main-table quality cell
- **Impact:** Detail cards pass (text labels + meter bars). Failure is confined to multi-row tables where color is the only signal for "this month is hot" or "this location has low-quality healthcare."
- **Remediation:** Climate — append `sr-only` text `(hot)` / `(cold)` inside class-targeted cells. Healthcare — add `aria-label="Quality X — [tier]"` on the quality cell. Both XS.

### DFA-2026-04-21-003 [LOW] — Sankey SVG node labels lack accessible-text handling

- **Standard:** WCAG 4.1.2 Name, Role, Value
- **File:** `sankey-screen.component.ts:174-189`
- **Description:** `<rect>` has a `<title>` providing accessible name. Adjacent `<text>` labels render the same info visually — creating a double-read on NVDA/JAWS (rect title + sibling text).
- **Remediation:** Add `aria-hidden="true"` to both `<text>` elements per node group; the `<rect>` `<title>` remains the accessible name.

### DFA-2026-04-21-004 [LOW] — `outline: none` without `:focus-visible` replacement

- **Standard:** WCAG 2.4.7 Focus Visible; WCAG 2.2 new SC 2.4.11 Focus Appearance
- **Files:** Guardrails, IRMAA, Sankey, Map, Visa all have `outline: none` on `.param-input` / `.ctrl-input` with a `:focus { border-color: var(--dark-blue) }` replacement. The border-color change is visible but often doesn't clear WCAG 2.4.11's 3:1 perimeter-contrast requirement.
- **Remediation:** One global addition to `src/styles.scss` — `:focus-visible { outline: 2px solid var(--dark-amber); outline-offset: 2px; }` — fixes this across all screens old and new.

---

## Checklist Results — 10 Check Areas

| # | Check | Result | Notes |
|---|-------|--------|-------|
| 1 | Prose line length | ✓ Pass | `.header-sub`, `.param-hint`, `.insights` all use `line-height: var(--prose-line-height, 1.5)`. 70ch clamp from `styles.scss` applies globally. |
| 2 | Font-size floors | ✗ Partial fail | See DFA-2026-04-21-001. All prose / table body / card content ≥11px; axis + legend + `.badge-new` + `.factor` at 10px. |
| 3 | Color-only information | ✗ Partial fail | Guardrails status pills + IRMAA tier pills pass (text labels). Climate hot/cold + HC quality table columns fail. Map marker scale has numeric legend — passes. |
| 4 | Focus states | ~ Partial pass | `outline: none` replaced by border-color change; systemic. DFA-2026-04-21-004. |
| 5 | Text on image/SVG | ✓ Pass | Sankey text uses `paint-order: stroke; stroke: var(--dark-bg-card); stroke-width: 3px`. Map popups use dashboard dark theme. |
| 6 | Plain language | ✓ Pass | `.insights` bullets single-idea <20 words. Estate exemption note 28 words borderline-acceptable given technical content. |
| 7 | Reflow / responsive | ✓ Pass | All new screens use `grid-template-columns: repeat(auto-fit/auto-fill, minmax(Npx, 1fr))`. |
| 8 | Wide tables `.table-wrap` | ✓ Pass | Estate (8 col), Climate (13 col), IRMAA (7 col) all wrapped. |
| 9 | Read-aloud compatibility | ✓ Pass | No new screen blocks text selection or pointer events on prose. |
| 10 | OpenDyslexic / font override | ✓ Pass | All new screens use `font-family: var(--font-sans)` or inherit. |

---

## Carry-over Findings (unchanged)

| ID | Title | Status |
|----|-------|--------|
| DFA-2026-04-19-006 | OpenDyslexic 400-only bundle (`index.html:14`) | OPEN |
| DFA-2026-04-19-007 | Read-aloud lacks pause/resume | OPEN |
| DFA-2026-04-19-008 | Reading progress bar default-off | OPEN |

---

## Composite Score

| Dimension | Weight | Score | Weighted | Δ from 2026-04-20 |
|---|---|---|---|---|
| BDA Typography | 20% | 92 | 18.4 | −3 |
| BDA / WCAG Color & Contrast | 15% | 93 | 14.0 | −2 |
| BDA / GOV.UK Plain Language | 15% | 90 | 13.5 | 0 |
| WCAG 1.4 spacing / reflow / resize | 15% | 95 | 14.3 | 0 |
| User control / customisation | 15% | 95 | 14.3 | 0 |
| Reading support (TTS, bionic, ruler) | 10% | 85 | 8.5 | 0 |
| Navigation & cognitive-load | 5% | 85 | 4.3 | 0 |
| Semantic accessibility (ARIA, keyboard) | 5% | 88 | 4.4 | −7 |
| **Composite** | **100%** | | **91.7 → 92** | **−1** |

**Grade: A (92/100)** — down one point from 93 on 2026-04-20. Regression attributable to new screens replicating the 10px pattern at larger surface area and two new color-only table columns.

---

## Prioritised Remediation

| Rank | Finding | Effort | Impact |
|---|---|---|---|
| 1 | DFA-2026-04-21-001 — raise axis/legend/node-value text to 11px | XS | WCAG 1.4.4 floor restored |
| 2 | DFA-2026-04-21-002 — sr-only text in Climate hot/cold + aria-label on HC quality | XS | Closes color-only gap |
| 3 | DFA-2026-04-21-003 — aria-hidden on Sankey SVG text | XS | Eliminates double-read |
| 4 | DFA-2026-04-21-004 — global `:focus-visible` in styles.scss | S | Systemic focus appearance fix |
| 5 | DFA-2026-04-19-006 — OpenDyslexic 700 weight | XS | Carry-over |
| 6 | DFA-2026-04-19-008 — flip progress-bar default | S | Carry-over |
| 7 | DFA-2026-04-19-007 — 3-state read-aloud | S | Carry-over |
| 8 | Promote `check:readability` to CI | S | Preventive |

---

## Version History

| Date | Version | Changes |
|---|---|---|
| 2026-04-16 | 1.0 | Initial — B / 62 |
| 2026-04-19 | 2.0 | 9 findings fixed; A- / 84 |
| 2026-04-20 | 3.0 | HIGH + all MEDIUM closed; A / 93 |
| 2026-04-21 | 4.0 | Delta for 11 new + 4 modified; 4 new findings (1 MED, 3 LOW); A / 92 |
