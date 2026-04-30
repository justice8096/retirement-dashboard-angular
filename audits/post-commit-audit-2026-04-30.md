# Post-Commit Audit — 2026-04-30 session batch

| Field | Value |
|---|---|
| **Date** | 2026-04-30 |
| **Repos** | retirement-dashboard-angular (heaviest), retirement-api |
| **Trigger** | End-of-session sweep covering 7 dashboard PRs + 4 api PRs landed today |
| **Previous post-commit audit** | `audits/complexity-audit-2026-04-26-post-mc-split.md` (PRs #63–#67, MC god-component split) |

---

## Executive summary

A single working session shipped **11 PRs across two repos**, closing 4 substantive todos (#10 cleanup + FPL fix, #25, #26, #33) plus one bookkeeping discovery (#23 was already implemented). Open todos in `Todos.md`: **17 → 14**.

The work is heavily concentrated on the **Monte Carlo kernel** (`src/app/lib/monte-carlo.ts`, dashboard) and the **shared tax helpers** (`shared/taxes.js`, api). Both files grew by net +300+ LOC carrying real new behavior; both stayed within established design idioms (additive params, fallback-on-omit, citation arrays alongside constants).

**Risk surface added:** ~zero. All changes are additive — no auth surface, no new HTTP routes, no new npm dependencies, no migrations. Codex flagged 5 issues during review; all 5 closed in same-day follow-ups. Pre-existing `costShockMult < 0` math edge case noted but out of scope for any single PR.

**Test coverage delta:** api +78 tests (35,421 → 35,499). Dashboard remains 0 — no test infrastructure in this repo, by design (TypeScript strict mode + manual preview verification carry the burden). All MC kernel changes verified as algebraically reducible to pre-change behavior on the legacy code path; deviations only when new params are explicitly opted into.

---

## PRs landed today (chronological)

### retirement-dashboard-angular

| PR | Title | Closes | Net Δ |
|---|---|---|---:|
| [#91](https://github.com/justice8096/retirement-dashboard-angular/pull/91) | `fix(aca)`: correct 2026 FPL per-additional-person increment ($5,600 → $5,680) | #10 follow-up | +9 |
| [#92](https://github.com/justice8096/retirement-dashboard-angular/pull/92) | `feat(mc)`: HSA balance + medical-cost offset (#33 item 3) — closes #33 | #33 | +98 |
| [#94](https://github.com/justice8096/retirement-dashboard-angular/pull/94) | `feat(location-detail)`: FX stress widget for foreign-currency locations | #26 | +165 |
| [#93](https://github.com/justice8096/retirement-dashboard-angular/pull/93) | `feat(mc)`: per-category inflation breakdown panel under Mean Inflation | #25 | +180 |
| [#95](https://github.com/justice8096/retirement-dashboard-angular/pull/95) | `feat(mc)`: Life Events data model + compileLifeEvents adapter (#31 step 1) | #31 step 1 | +168 |
| [#96](https://github.com/justice8096/retirement-dashboard-angular/pull/96) | `fix(mc)`: filter compileLifeEvents output to kernel's actual run horizon | Codex P2 on #95 | +13 |
| [#97](https://github.com/justice8096/retirement-dashboard-angular/pull/97) | `refactor(mc)`: tighten Life Events module per simplify review | self-review | −69 |

**Dashboard total:** +564 LOC across 7 PRs in `src/app/lib/monte-carlo.ts` + scattered UI files.

### retirement-api

| PR | Title | Closes | Net Δ |
|---|---|---|---:|
| [#86](https://github.com/justice8096/retirement-api/pull/86) | `feat(taxes)`: add 2026 LTCG brackets + NIIT (#33 item 1) | #33 item 1 | +274 |
| [#87](https://github.com/justice8096/retirement-api/pull/87) | `feat(taxes)`: wire investment-income composition into calcTaxesForLocation (#33 item 2) | #33 item 2 | +265 |
| [#88](https://github.com/justice8096/retirement-api/pull/88) | `feat(taxes)`: add LTCG harvesting headroom helpers (#27) | #27 (helpers) | +229 |
| [#89](https://github.com/justice8096/retirement-api/pull/89) | `fix(taxes)`: harden filing-status lookups against prototype keys | Codex P2 on #88 | +104 |

**API total:** +872 LOC, almost entirely in `shared/taxes.js` (+274 + +265 + +229 + tests + decl). 78 new test cases.

---

## Code health — top oversized files

```
find src/app -name "*.ts" -not -path "*/data/locations/*" | xargs wc -l | sort -rn | head -10
```

| # | File | LOC | Δ vs 2026-04-26 audit | Classification |
|---|---|---:|---:|---|
| 1 | `lib/monte-carlo.ts` | 1080 | **+320** | Single-algorithm kernel — intentional. **DO NOT REFACTOR**. Growth from HSA (#92) + inflation breakdown helpers (#93) + Life Events data model (#95+#96+#97). |
| 2 | `screens/report-screen/report-screen.component.ts` | 938 | −1 | Markdown generation; reuses FIRE/Guardrail helpers. Unchanged today. |
| 3 | `screens/estate-screen/estate-screen.component.ts` | 631 | (new top-3) | Unchanged today. |
| 4 | `screens/guardrails-screen/guardrails-screen.component.ts` | 553 | 0 | Form-heavy. Unchanged today. |
| 5 | `services/healthcare.service.ts` | 536 | 0 | Unchanged today. |
| 6 | `content/help-content.ts` | 535 | 0 | Static help copy. Unchanged today. |
| 7 | `screens/sankey-screen/sankey-screen.component.ts` | 499 | 0 | Unchanged today. |
| 8 | `services/monte-carlo-state.service.ts` | 475 | +14 | Inflation breakdown computed signal (#93). |
| 9 | `screens/location-overview/location-overview.component.ts` | 453 | 0 | Unchanged today. |
| 10 | `screens/neighborhoods-screen/neighborhoods-screen.component.ts` | 448 | 0 | Unchanged today. |

`monte-carlo.ts` at 1080 LOC is now the new outlier. Per the 2026-04-26 audit it was already flagged as **DO NOT REFACTOR** (single-algorithm file, splitting hurts readability). The +320 today is real new functionality, not bloat — but next session should plan the **#31 step 2 kernel-loop refactor** carefully because that's where complexity is actually accumulating (the inner trial loop is now ~150 LOC of bespoke event handling that step 2 will replace with a generic dispatcher).

---

## Security & supply-chain delta

- **No new attack surface.** Zero new HTTP routes, zero new auth flows. All MC kernel changes are pure compute on pre-existing inputs. The api's tax pipeline gained input fields (`investComposition`, `earnedIncome` is reserved but not yet plumbed) but every new field goes through the same validation pattern as existing fields.
- **No npm dependency adds.** The only deps churn today was a Stripe minor (22.0.2 → 22.1.0) merged via dependabot before the session, unrelated.
- **Codex security findings:** 0 P1, 0 P2-security. All 5 Codex findings this session were **correctness or accessibility**, not security:
  | PR | Finding | Closed by |
  |---|---|---|
  | api#87 | P1 unused-deduction not applied to LTCG | api#87 amend |
  | api#87 | P2 FTC mutates `details[0]` after composition rows added | api#87 amend |
  | api#88 | P2 prototype-key bypass on `table[fs] \|\| table.mfj` | api#89 |
  | dashboard#92 | P2 `hsaDraw` flips negative when `currShock < 0` | dashboard#92 amend |
  | dashboard#93 | P2 `<details>` nested inside `<label>` (a11y) | dashboard#93 amend |
  | dashboard#95 | P2 `compileLifeEvents` doesn't filter to sim horizon | dashboard#96 |
- **Pre-existing edge case noted:** `costShockMult < 0` flips the main `bal -= cost*12*shocks` line into a phantom income windfall when degenerate trials produce `currShock < 0` (probability ~2.3% per year at `currVol=50%`, astronomically rare at default 5%). Flagged in dashboard#92's commit body as out-of-scope. Worth a defensive clamp in a future kernel sweep, not blocking.

---

## Codex review backlog

**Cleared** (all of today's substantive findings):
- ✅ api#87 P1 (Schedule D unused-deduction offset)
- ✅ api#87 P2 (FTC detail row breakdown)
- ✅ api#88 P2 (prototype-key hardening) — separate PR api#89
- ✅ dashboard#92 P2 (HSA draw negative-clamp)
- ✅ dashboard#93 P2 (form-label semantics)
- ✅ dashboard#95 P2 (horizon filter parity) — separate PR dashboard#96

**Open:**
- None at session end.

---

## Test coverage

### retirement-api — 35,499 passing (was 35,421 at session start, **+78**)

| PR | New test cases | Coverage area |
|---|---:|---|
| #86 | 26 | LTCG brackets + ladder + NIIT + filing-status fallback |
| #87 | 18 | Income-composition routing, NIIT integration, FTC reconciliation, prior-bug regressions |
| #88 | 17 | Harvesting headroom + summary, marginal-rate transitions |
| #89 | 17 | Prototype-key contract for `it.each(['toString', '__proto__', 'constructor', 'valueOf', 'hasOwnProperty'])` |

### retirement-dashboard-angular — 0 (unchanged)

This repo has no test infrastructure (`.spec.ts` files don't exist; project deliberately skips Karma/Jest setup — TypeScript strict mode + manual preview verification carry correctness). Verification on dashboard PRs followed the established pattern:
- `npx tsc --noEmit -p tsconfig.app.json` — clean on every PR
- Algebraic reduction proofs in commit bodies (HSA: golden path is byte-identical when params absent; Life Events: kernel still reads legacy fields)
- Browser preview verification **blocked by Clerk sign-in gate** on the dev server for every UI PR — explicit caveat in each PR description; the user acknowledged the constraint and agreed to manual eyeball post-merge

This dashboard testing gap is the **#1 standing risk** in the codebase. Worth flagging to the user as a candidate for the next code-health initiative (e.g., add Vitest config + smoke tests for the MC kernel pure functions; the kernel doesn't depend on Angular DI for its math, so testable in isolation).

---

## Followups generated this session

### Async background work
- **FEIE recon agent** scheduled for 2026-05-14 (one-time, queued). Will inspect both repos to see if the part-time-income → tax-pipeline wiring exists yet; if so, opens a draft issue to revive #33 item 4 (currently deferred).
- **Spawned task** for #27 part 2 (LTCG harvesting advisor UI panel) — chip waiting for user to launch in a fresh worktree.

### Deferred with rationale (from #33 closure)
- **#33 item 4 (FEIE)** — has no caller in the current pipeline. Re-evaluate when part-time/wage income gets routed through the federal tax pipeline.
- **#33 item 5 (contribution-limit indexing)** — out of scope for retirement-phase tool; product doesn't model accumulation phase.

### Standing flags
- **Pre-existing `costShockMult < 0`** — phantom income windfall in degenerate trials. Defensive `Math.max(0, ...)` clamp applies the same fix pattern HSA got. Out of scope today; worth a focused 1-line cleanup PR when convenient.
- **Dashboard test infrastructure** — single biggest correctness gap in the repo. MC kernel pure functions (`weightedInflationFromLocation`, `inflationBreakdownFromLocation`, `compileLifeEvents`, etc.) are trivially testable but have zero coverage. Adding Vitest config would unlock the same quality bar the api enjoys.
- **#31 step 2 kernel-loop refactor** — the riskiest piece in the open queue. Without test infra, the inner-loop refactor depends entirely on algebraic reduction proofs to verify behavior preservation. The dashboard test infra item above is a hard prerequisite.

### Closed today
- #10 (FPL increment correction)
- #23 (one-time expenses planner — discovered already implemented; bookkeeping closure)
- #25 (per-category inflation breakdown panel)
- #26 (FX stress widget)
- #27 (helpers — UI part 2 spawned as separate task)
- #32 (Uptime Kuma monitor restoration)
- #33 (LTCG/NIIT/HSA tax-pipeline gaps; items 4-5 deferred)

---

## Recommendations (for future sessions)

1. **Add Vitest to retirement-dashboard-angular.** Start with the kernel pure helpers (`weightedInflationFromLocation`, `inflationBreakdownFromLocation`, `compileLifeEvents`, `ltcgFederalTax`-equivalent if any). Aim for ~20 tests on the lowest-risk surfaces first.
2. **Plan #31 step 2 carefully.** The inner-loop refactor is the highest-risk open work. Don't do it without test infra (#1 above). When ready, scope it as: (a) extract `for (const ev of eventsByYear[y]) { ... }` skeleton, (b) move `move` dispatch to a case branch, (c) move `spouseDeath` dispatch, (d) move `oneTimeExpense` dispatch, (e) verify byte-identical results across all 4 sampling modes on a fixed random seed. Five separate commits ≥ one big-bang.
3. **Ship the FX `currShock < 0` clamp.** One-line defensive fix, mirrors the HSA pattern. Low risk, real correctness improvement at high `currVol` settings.
4. **Schedule a periodic Codex re-run** on long-lived PRs. The session produced two cases where Codex flagged after merge — a Codex re-review on the 24h mark would catch these before they require follow-up PRs.

---

## Appendix — file change summary

```
src/app/lib/monte-carlo.ts                                  +320 / −13   (HSA, inflation breakdown, Life Events, cleanup)
src/app/services/monte-carlo-state.service.ts               +14          (inflation breakdown computed signal)
src/app/components/screens/montecarlo-screen/.../mc-parameters.component.{html,scss,ts}  +99   (inflation breakdown panel)
src/app/components/screens/location-detail/location-detail.component.ts                  +165  (FX stress widget)
src/app/lib/aca-constants.ts                                +9 / −2      (FPL increment correction)
```

```
shared/taxes.js                                             +600 / −15   (LTCG, NIIT, harvesting helpers, prototype-key)
shared/taxes.d.ts                                           +90          (TS declarations matching new exports)
shared/__tests__/taxes.test.js                              +480         (78 new test cases)
```
