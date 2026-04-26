# Complexity Audit — retirement-dashboard-angular (post MC god-component split)

| Field | Value |
|---|---|
| **Date** | 2026-04-26 |
| **Commit** | `44c6424` (main) |
| **Previous audit** | `complexity-audit-2026-04-25.md` — established the audit's #1 follow-up (montecarlo-screen god-component split, deferred as 3–4 weeks) |
| **Trigger** | Audit follow-up #1 closed via PRs #63 / #65 / #66 / #67 — refresh the top-10 oversized-files list |

---

## Executive summary

The 2026-04-25 audit listed `montecarlo-screen.component.ts` as the #1 oversized file at **2,227 LOC** (78 signals, 5 features mixed in, inline 832-LOC template). Splitting it was the audit's #1 follow-up, deferred at the time as a 3–4 week effort.

That follow-up is now **closed**. Across 4 PRs in one session (#63 Phase 1, #65 Phase 2a, #66 Phase 2b, #67 Phase 2c), the parent component dropped from 2,227 LOC to **133 LOC** — a 94% reduction — by carving state into a service, splitting templates into 4 sibling sub-components, extracting a runner service for kernel orchestration, and dropping the now-unused facade pass-throughs.

The MC parent **falls off the top-10 oversized list entirely**. New top-10 below.

---

## New top-10 oversized files (2026-04-26)

Source: `find src/app -name "*.ts" | xargs wc -l | sort -rn` (excluding seed data in `src/app/data/locations/*`).

| # | File | LOC | Δ vs 2026-04-25 | Classification |
|---|------|----:|----:|---|
| 1 | `report-screen.component.ts` | 938 | −1 | Markdown generation; reuses FIRE/Guardrail helpers from PR #60 |
| 2 | `monte-carlo.ts` (kernel) | 760 | 0 | Intentional — single-algorithm file. **DO NOT REFACTOR** |
| 3 | `guardrails-screen.component.ts` | 553 | −8 | Form-heavy screen; FIRE/Guardrail math now imported from `lib/fire-math.ts` |
| 4 | `healthcare.service.ts` | 536 | 0 | Multi-regime service — acceptable, domain-driven |
| 5 | `help-content.ts` | 535 | 0 | String literals only |
| 6 | `sankey-screen.component.ts` | 499 | 0 | SVG generation + cash-flow calc |
| 7 | `location-overview.component.ts` | 453 | new in top-10 | Was just below the line |
| 8 | `neighborhoods-screen.component.ts` | 448 | new in top-10 | Was just below the line |
| 9 | `scenarios-screen.component.ts` | 435 | new in top-10 | Was just below the line |
| 10 | `estate-screen.component.ts` | 435 | new in top-10 | Was just below the line |

**Notable departures from the 2026-04-25 top-10:**

| File | Was | Now | Reason |
|---|----:|----:|---|
| `montecarlo-screen.component.ts` | 2,227 (#1) | 133 | Phase 1 + 2a/b/c god-component split (#63/#65/#66/#67) |
| `location-compare.component.ts` | 1,175 (#2) | not on .ts list (~336 .ts after PR #61) | Template extracted in PR #61 |
| `assumptions-screen.component.ts` | 752 (#5) | 217 | Template extracted in PR #61 |
| `api.model.ts` | 628 (#6) | 24 (barrel) | Domain split in PR #62 |

The list is healthier overall: the largest non-intentional file is now `report-screen` at 938, which is markdown generation (genuinely string-heavy, lower complexity than its LOC suggests). Of the new top-10, only #11 in the LOC ranking — `monte-carlo-state.service.ts` (425 LOC) — is structurally similar to a "god component" risk, and that one is acceptable: it's the explicitly-extracted state-of-truth service for MC, with a single domain (Monte Carlo simulation state).

---

## MC component family (post-split)

For reference, the new MC architecture's LOC distribution:

| File | LOC | Role |
|---|----:|---|
| `montecarlo-screen.component.ts` | 133 | Thin parent — lifecycle + ngOnInit API loads + fmt adapter |
| `montecarlo-screen.component.html` | 72 | Template — header + run trigger + SS card + 4 sub-component tags |
| `mc-parameters.component.ts` | 43 | Sim Parameters card (15 inputs) |
| `mc-sampling.component.ts` | 42 | Historical & Cycles card (sampling mode + presets + regime) |
| `mc-scenarios.component.ts` | 111 | 5 what-if cards (moves, one-time, LTC, FX, spouse-death) |
| `mc-results.component.ts` | 360 | Post-run results: success grid + chart + percentiles + SVG export |
| `monte-carlo-state.service.ts` | 425 | All sim signals + computeds + simDirty effect + default-location effect |
| `monte-carlo-runner.service.ts` | 172 | `run()` orchestration; kernel-payload builders |
| `calm-reveal.service.ts` | 54 | Generic step-counter for progressive reveal |

Total across the 9-file MC family: **1,412 LOC**, including all template + class + service code. This is up from the original 2,167-LOC single class — but the 1,412 LOC is properly distributed across architectural layers, with the largest single class at 360 LOC.

The new shape respects audit follow-up #1's intent: no single file is a "god component". The runner service (172 LOC) is the action layer, the state service (425 LOC) is the data layer, and the 4 sub-components (43–360 LOC) are presentation layers.

---

## Audit follow-up status

| # | Item | 2026-04-25 status | 2026-04-26 status |
|---|------|---|---|
| 1 | god-component split (montecarlo-screen) | DEFERRED (3–4 wk effort) | **✅ CLOSED** — PRs #63 / #65 / #66 / #67 |
| 2 | api.model.ts domain split | OPEN | ✅ CLOSED — PR #62 (barrel) |
| 3 | remaining `fmt()` wrappers (~20 screens) | OPEN | OPEN — opportunistic; explicitly low-value |
| 4 | component-styles audit | OPEN | ✅ CLOSED — PR #62 (hoisted to styles.scss) |

3 of 4 follow-ups closed in 8 days. Item #3 (the remaining `fmt()` wrappers) is genuinely low-value-high-churn per the prior audit and stays in the opportunistic-during-other-touches bucket.

---

## Other observations from the diff

- **Phase 1's facade pass-throughs were correctly identified as transitional debt.** They were necessary during Phase 1 to keep the template untouched; Phase 2a/b made them mostly-vestigial; Phase 2c retired them when the runner moved to a service. The 4-phase sequencing prevented a single risky big-bang refactor.
- **CalmRevealService is a genuine generic abstraction, not YAGNI.** The MC results component is its only consumer today, but the API surface is minimal (5 methods, no fancy features) and the user signal during planning specifically called out future calm-mode candidates (FIRE Calc results, scenarios compare, etc.). The abstraction cost is bounded.
- **The `mc-scenarios` 5-card bundle is the most likely re-split candidate** if any single what-if scenario grows substantially. Today the 5 toggles share a coherent "optional sim modifiers" semantic; a future feature like "scenario presets" or "filter by enabled scenarios" would slot in here without further restructuring.

---

## What NOT to refactor (carried forward)

Same as the 2026-04-25 audit:

- **`monte-carlo.ts` kernel (760 LOC)** — intentionally monolithic, single algorithm
- **`api.model.ts` (now 24 LOC barrel)** — domain split done in PR #62; do not reverse
- **`healthcare.service.ts` (536 LOC)** — tightly coupled by design; ACA logic is inherently multi-regime

Adding `monte-carlo-state.service.ts` to this list — it's the explicit single-source-of-truth for MC sim state, exactly what audit follow-up #1 asked for. Its 425 LOC are domain-cohesive (50 input signals + 28 derived computeds, all about Monte Carlo simulation). Splitting further would re-create the prop-drilling problem the service was extracted to solve.

---

## Methodology notes

- LOC numbers from `find src/app -name "*.ts" -not -path "*/data/locations/*" | xargs wc -l | sort -rn`
- Each refactor PR validated by `npx tsc --noEmit` + `npm run check:numeric-inputs` + interactive preview-server smoke tests (sim-run end-to-end + state inspection)
- All 4 PRs CI-green throughout (`build-and-check`, `sbom`, `security-audit`, `codeql-analysis`)
- Stacked-PR rebases on main were required between #65→#66 and #66→#67 (force-push with `--force-with-lease`); GitHub patch-id matching cleanly dropped the parent-PR's commits during each rebase

---

## Open follow-ups

Nothing new this cycle. The 2026-04-25 audit's #3 (remaining `fmt()` wrappers) remains the only open item and is explicitly opportunistic.

One un-numbered item carried in the 2026-04-26 SAST audit recommendations: migrate the two inline `esc()` copies (`brochure-screen.component.ts`, `mc-results.component.ts`) to the shared `text-escape.ts`. Latent drift risk; small fix; not urgent.
