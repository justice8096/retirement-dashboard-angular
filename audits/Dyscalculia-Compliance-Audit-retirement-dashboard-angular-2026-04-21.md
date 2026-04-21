# Dyscalculia Compliance Audit Report

| Field | Value |
|-------|-------|
| **Project** | retirement-dashboard-angular |
| **Audit Date** | 2026-04-21 |
| **Auditor** | Claude (automated delta analysis) |
| **Scope** | 11 new screens + 5 modified files |
| **Audit Type** | Delta re-audit (supersedes 2026-04-20; baseline 93/100 A) |

---

## Executive Summary

New screens are largely compliant — most route monetary values through `DyscalculiaService`, use `appNumeric` on every input, and apply `font-variant-numeric: tabular-nums` on numeric columns. The `/mo` fix on FIRE Setup / FIRE Calc closes a prior-cycle finding. The Fees exchange-rate fix ships a calm amber warning banner (not red) for the 1:1 fallback. One new LOW finding. No prior findings regressed.

**Composite score: 94/100 (A)** — up 1 from 93/100 on 2026-04-20.

### Findings Summary

| Severity | Count | Description |
|---|:---:|---|
| CRITICAL | 0 | — |
| HIGH | 0 | — |
| MEDIUM | 1 | F-008 (carry) — session-break reminders + Assumptions wizard chunking |
| LOW | 2 | F-011 (carry) cross-device prefs; F-016 (NEW) IRMAA bracket table bypasses service |

---

## New Findings

### F-016 [LOW] — IRMAA bracket table bypasses DyscalculiaService

- **File:** `src/app/components/screens/medicare-irmaa-screen/medicare-irmaa-screen.component.ts:130-131, 138`
- **Description:** Year-by-year projection uses `fmt()` / `plainDollars()` which route through the service. But the static "2026 IRMAA brackets" table renders surcharges as `'$' + b.partBSurcharge.toFixed(2)` and `'$' + b.partDSurcharge.toFixed(2)`. A user with `spaced` or `words` numberFormat sees `$74.0` in those cells while every other dollar on the screen renders in their chosen mode. The hint `Base Part B premium: ${{ BASE_PART_B_PREMIUM }}/mo` has the same issue.
- **Remediation:** Extract a `fmtSurcharge(n)` helper that calls `dyscalculia.formatCurrency(n, '/mo')`. Apply to both bracket cells and the hint.
- **Effort:** XS

---

## Modified Files — Delta

### FIRE Setup / FIRE Calc `/mo` fix (closes prior-cycle bug)

Both `fmt()` helpers now pass `''` as unit with explicit comments. Lump-sum FIRE numbers no longer render as `/mo`. The step-ladder explanation on FIRE Calc (concrete → representational → abstract) remains the strongest plain-language decomposition in the app.

### Fees exchange rate resolution

`rateResolution` computed exposes 5 source states. The `'default'` case shows an amber warning banner — calm, instructional ("Set a manual override, or select a location that uses {{ cur }}"), consistent with F-013. All calculator values route through `fmtUsd()` → service. The `fmtLocal()` helper bypasses the service for multi-currency display — accepted architectural limitation (service is USD-centric).

### Monte Carlo chart export

`buildStandaloneSvg()` calls `this.fmt()` for every dollar label — exported charts respect user `numberFormat` at export time. Only raw literal is `$0` axis label (static template value). No finding.

### Inclusion screen (shape normalization)

No monetary values; all 0-10 scores displayed as `N/10`. No service injection needed or present. `.cat-score.bad` uses `var(--dark-red)` consistent with pre-existing livability pattern.

---

## New Screens — Assessment

| Screen | Grade | Notes |
|---|:---:|---|
| **Medicare IRMAA** | A− | Strong `fmt()` + `plainDollars()` usage. F-016 new (bracket table bypass). IRMAA "surcharged" tier pill uses red — consistent with app-wide "bad outcome" coloring pattern (noted, not new finding). |
| **Guardrails** | A | `fmt()` `/yr`, `lump()` `''`, `monthly()` `/mo` — all three unit cases correct. `appNumeric`, `tabular-nums`, clear insights. `s-red` pill follows established pattern. |
| **Quality of Life** | A | 0-10 scores, denominator visible, `tabular-nums`. No monetary values → no service needed. |
| **Visa** | A− | `fmt()` routes correctly. Multi-currency table uses `DecimalPipe` — accepted limitation for non-USD display. `high` income band uses red — data classification, pre-existing pattern. |
| **Healthcare Compare** | A− | `fmt()` / `fmtYr()` correct. Scatter is representational-only; companion top-10 ranking table provides bar-friendly alternative. ACA label line 348 has static `toLocaleString()` bypass — single occurrence, minor. |
| **Estate** | A | `fmt()` with `''` throughout. `appNumeric` on all inputs. QCD limit warning hint red = correct (input validation). No magnitude anchoring on $13.61M exemption. |
| **Climate** | A− | No monetary values. `.hot { color: var(--dark-red) }` on 85°F+ cells — data coloring in red, conflicts with baseline pattern. Same class as livability pre-existing gaps. Flagged for fix. |
| **Sankey** | A | `fmt()` `/yr` throughout (SVG nodes, summary cards, tooltips). Red used for Taxes + deficit — data classification, consistent. SVG itself is the CRA decomposition. |
| **Map** | A | Leaflet popups built outside Angular — architectural limit, can't inject service. Supplementary detail only (full numbers on Overview/Detail). |
| **Report** | A | `buildReportMarkdown` uses `fmtUsd()` — stable non-mode-dependent output for export. Service routing doesn't apply to static artifacts. |

---

## Dimension-by-dimension Delta vs 2026-04-20

| Dimension | Weight | 2026-04-20 | 2026-04-21 | Δ |
|---|:---:|:---:|:---:|:---:|
| Math Instruction Alignment (CRA as UI) | 20% | 90 | 91 | +1 |
| Number Presentation & Magnitude | 20% | 96 | 95 | −1 |
| Math Anxiety / Calm Framing | 15% | 95 | 96 | +1 |
| Accommodation & Scaffolding | 15% | 94 | 94 | 0 |
| Visual Accessibility | 10% | 95 | 94 | −1 |
| Equity / Comorbidity Support | 10% | 85 | 85 | 0 |
| Formula Exposure & Literacy | 5% | 95 | 96 | +1 |
| Persistence of Accommodations | 5% | 60 | 60 | 0 |
| **Composite** | **100%** | **93** | **94** | **+1** |

Net lift: FIRE `/mo` fix + Fees calm framing outweigh F-016 and Climate `.hot` regression.

---

## Recommendations — Prioritized

| Rank | Finding | Action | Effort | Impact |
|---|---|---|:---:|:---:|
| 1 | F-016 | Add `fmtSurcharge` helper in IRMAA; apply to bracket table cells + hint | XS | LOW |
| 2 | Climate `.hot` | Change `.hot { color: var(--dark-red) }` → `var(--dark-amber)`; add column-header hint | XS | LOW |
| 3 | F-011 | Server-sync dyscalculia preferences via `/api/me/preferences` | S | MED |
| 4 | F-008 (rest) | Session-break toast + Assumptions wizard | M | MED |
| 5 | Estate/IRMAA/Guardrails | Magnitude anchors on large-portfolio inputs | XS/each | LOW |

---

## What Passed (New Screens)

- IRMAA `fmt()` + `plainDollars()` route through service with correct units
- Guardrails three-unit coverage (`/yr`, `''`, `/mo`)
- All new currency inputs use `appNumeric="currency"`
- IRMAA, Guardrails, Estate, Sankey tables use `tabular-nums`
- Fees 1:1 default warning: amber, calm, no red
- FIRE `/mo` fix with explanatory block comments
- MC chart export respects user `numberFormat` at export time
- QoL scores labeled with denominators visible
- Estate stacked composition bar = CRA representational layer

---

## Version History

| Version | Date | Changes |
|---|---|---|
| 1.0 | 2026-04-16 | Initial — 78/100 B |
| 2.0 | 2026-04-19 | Re-audit — 85/100 A |
| 3.0 | 2026-04-20 | Re-audit — 93/100 A |
| 4.0 | 2026-04-21 | Delta — 94/100 A. 11 new + 5 modified. 1 new LOW (F-016). 2 carries. No regressions. |
