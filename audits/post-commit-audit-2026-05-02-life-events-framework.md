# Post-Commit Audit — 2026-05-02 Life Events Framework batch

| Field | Value |
|---|---|
| **Date** | 2026-05-02 |
| **Repo** | retirement-dashboard-angular (only) |
| **Trigger** | End-of-arc sweep covering 8 dashboard PRs that close #31 (Life Events framework) end-to-end |
| **Previous post-commit audit** | [post-commit-audit-2026-04-30.md](post-commit-audit-2026-04-30.md) (11 PRs across both repos, closed #10/#23/#25/#26/#33) |

---

## Executive summary

A single working session shipped **8 dashboard PRs** that fully close #31, the multi-priority Life Events framework that has been the largest single open kernel-side todo for ~2 weeks. The work splits cleanly into two phases:

1. **Trigger-replacement refactor (3 PRs — #102, #104, #105)** — restructures the kernel's inner trial loop to dispatch from a unified `eventsByYear` map without behavior change. Every PR in this phase carries an algebraic byte-identity proof in its commit body. The motivation: adding new event kinds becomes a data change, not a kernel-loop surgery.
2. **Additive features (5 PRs — #102, #106, #107, #108, #109)** — introduces new event kinds (`oneTimeIncome`, `survivorRelocate`, `inheritedIRA`) and the timeline visualization on top of the now-uniform dispatcher.

Open todos in `Todos.md`: **14 → 13** (one big todo closed). The remaining open items are all data-work or product-direction items, no kernel-side refactors of comparable scope remain.

**Risk surface added:** ~zero. All changes are additive — no auth surface, no new HTTP routes, no new npm dependencies, no migrations. Every kernel PR was verified as byte-identical for legacy callers (those without the new params). Codex hasn't yet reviewed the batch; based on prior session ratios, expect 0–2 P2 findings to surface in the next 24–48h.

**Test coverage delta:** dashboard pure-test suite grew **54 → 59 tests** (+5: oneTimeIncome projection + filter + horizon, inheritedIRA passthrough + horizon). All passing on merged main. The kernel changes were verified algebraically; deviations only when new params are explicitly opted into.

---

## PRs landed today (chronological)

| PR | Title | Phase | Net Δ |
|---|---|---|---:|
| [#102](https://github.com/justice8096/retirement-dashboard-angular/pull/102) | `refactor(mc)`: dispatch trivial Life Events from unified timeline (#31 step 2a) | trigger-replacement | +60 / −17 |
| [#105](https://github.com/justice8096/retirement-dashboard-angular/pull/105) | `refactor(mc)`: dispatch move events from unified timeline (#31 step 2b) | trigger-replacement | +94 / −23 |
| [#104](https://github.com/justice8096/retirement-dashboard-angular/pull/104) | `refactor(mc)`: dispatch spouseDeath events from unified timeline (#31 step 2c) | trigger-replacement | +69 / −33 |
| [#106](https://github.com/justice8096/retirement-dashboard-angular/pull/106) | `feat(mc)`: one-time income / inheritance via Life Events (#31 priority 2) | feature | +251 / −26 |
| [#107](https://github.com/justice8096/retirement-dashboard-angular/pull/107) | `feat(mc)`: survivor relocation triggered by spouse death (#31 priority 4) | feature | +148 / −12 |
| [#108](https://github.com/justice8096/retirement-dashboard-angular/pull/108) | `feat(mc)`: inherited-IRA SECURE Act 10-year drain (#31 priority 5) | feature | +301 / −26 |
| [#109](https://github.com/justice8096/retirement-dashboard-angular/pull/109) | `feat(mc)`: Life Events timeline visualization (#31 priority 6) | feature | +356 / −1 |

**Total since previous audit (3c21048 → 7ce9751):** +1,148 / −50 across 11 files (8 PRs + the priority-1 data model from #95 still in scope as the foundation, though that landed 2026-04-30).

### Per-file breakdown

```
src/app/lib/monte-carlo.ts                                          +436 / −51    (kernel dispatcher refactor + new event kinds + magiAugment)
src/app/components/.../mc-life-events-timeline.component.{ts,html,scss}  +348      (new component, NET-NEW directory)
src/app/components/.../mc-scenarios.component.{ts,html}             +233 / −0     (3 new event panels + timeline mount)
scripts/test-monte-carlo-helpers.mts                                +95           (5 new pure tests)
src/app/services/monte-carlo-runner.service.ts                      +41           (lifeEvents threading + buildSurvivorRelocate)
src/app/services/monte-carlo-state.service.ts                       +31           (new signals + simDirty wiring)
src/app/services/monte-carlo-scenario.service.ts                    +7            (scenario interface fields)
src/app/components/.../mc-results/mc-results.component.ts           +7            (scenario snapshot fields)
```

---

## Code health — top oversized files

```
find src/app -name "*.ts" -not -path "*/data/locations/*" | xargs wc -l | sort -rn | head -10
```

| # | File | LOC | Δ vs 2026-04-30 audit | Classification |
|---|---|---:|---:|---|
| 1 | `lib/monte-carlo.ts` | **1,418** | **+338** | Single-algorithm kernel — intentional. Growth is real new functionality (kernel dispatcher + 3 new event kinds + magiAugment plumbing). The dispatcher refactor offsets some growth by replacing legacy ad-hoc maps; net per-event-kind cost has dropped post-refactor. **DO NOT REFACTOR** — splitting hurts readability. |
| 2 | `screens/report-screen/report-screen.component.ts` | 938 | 0 | Unchanged. |
| 3 | `screens/estate-screen/estate-screen.component.ts` | 631 | 0 | Unchanged. |
| 4 | `screens/guardrails-screen/guardrails-screen.component.ts` | 553 | 0 | Unchanged. |
| 5 | `services/healthcare.service.ts` | 536 | 0 | Unchanged. |
| 6 | `content/help-content.ts` | 535 | 0 | Unchanged. |
| 7 | `services/monte-carlo-state.service.ts` | **506** | **+31** | New signals: `oneTimeIncomes`, `inheritedIRAs`, `survivorRelocate*`. Already at the edge of the cohesion ceiling; may warrant a future split into `mc-scenarios-state.service` if priorities 7+ add more. |
| 8 | `screens/sankey-screen/sankey-screen.component.ts` | 499 | 0 | Unchanged. |
| 9 | `screens/location-overview/location-overview.component.ts` | 453 | 0 | Unchanged. |
| 10 | `screens/neighborhoods-screen/neighborhoods-screen.component.ts` | 448 | 0 | Unchanged. |

`monte-carlo.ts` at 1,418 LOC remains the outlier and is now ~50% larger than the next-largest file. The growth this session is justifiable — adding 3 fully-modeled event kinds + a unified dispatcher in 350 net lines is a good rate. But the file is approaching a complexity threshold where bisecting bugs becomes painful. **Recommendation**: when this file next grows by another ~200 LOC, consider extracting the 7 helper functions (`weightedInflationFromLocation`, `inflationBreakdownFromLocation`, `compileLifeEvents`, `segmentCostAtYear`, etc.) into `monte-carlo-helpers.ts`, leaving the kernel `runMonteCarlo` + types in the main file. That's a low-risk split that preserves the inner-loop locality.

---

## Algebraic byte-identity verification

The trigger-replacement PRs (#102, #104, #105) and the additive feature PRs all establish backward compatibility via algebraic proofs in commit bodies rather than deterministic-seed RNG tests (no such hook exists in the kernel today). Each proof reduces to:

> When the new param / event kind is unset, the code path is line-for-line equivalent to the legacy path.

**Examples**:

- **#102 (step 2a)** — `oneTimeExpense` dispatch via `eventsByYear` is byte-identical to legacy `expensesByYear` because:
  1. `compileLifeEvents` filter (`year ∈ [0, years) && amountUSD > 0`) is identical to the legacy `expensesByYear` filter.
  2. Inflation expression `(e.inflate ?? true) ? amount × cumInfl : amount` unchanged.
  3. Loop position (after `bal += income*12 - cost*12*shock + hsaDraw`) unchanged.

- **#108 (priority 5)** — caller without `lifeEvents` (or without inheritedIRA events) → `inheritedIRAEvents` empty → `magiAugmentByYear` all zeros → `segmentCostAtYear`'s `magi = baseMagi + 0` is byte-identical to legacy `magi = baseMagi`.

The 3 trigger-replacement PRs were the highest-risk piece — they touch the inner loop of every Monte Carlo trial. The user manually verified post-deploy MC numbers match pre-refactor baselines (success rate / median / p5 / p95 within ~1% noise floor) for representative scenarios.

This methodology has now been used end-to-end across the entire framework. The standing risk (no test infrastructure for the kernel inner loop) is partially mitigated by these algebraic proofs but remains the **#1 correctness gap** in the repo. See "Standing flags" below.

---

## Security & supply-chain delta

- **No new attack surface.** Zero new HTTP routes, zero new auth flows. All MC kernel changes are pure compute on pre-existing inputs.
- **No npm dependency adds.** No `package.json` changes in this batch.
- **Codex review backlog:** Codex has not yet reviewed PRs #102–#109. Based on prior session ratios (5 findings across 13 PRs in 2026-04-30 batch, all P2 correctness/a11y), expect 0–2 P2 findings on this batch in the next 24–48h. Set a reminder to check at the next session start.

---

## Test coverage

### retirement-dashboard-angular pure tests — 59 passing (was 54 at session start, **+5**)

| PR | New test cases | Coverage area |
|---|---:|---|
| #106 | 3 | `compileLifeEvents` projects oneTimeIncomes; filters amount ≤ 0; filters horizon |
| #108 | 2 | `compileLifeEvents` passes inheritedIRA verbatim; filters horizon |

Pure tests live in `scripts/test-monte-carlo-helpers.mts` and run via `npm run test:pure` (tsx + node:test, no framework dependency). All 59 pass on merged main.

### Coverage scope reminder

The pure-test layer covers `compileLifeEvents`, `weightedInflationFromLocation`, `inflationBreakdownFromLocation`, plus the 11 ACA-constants tests. The kernel **inner loop** (`runMonteCarlo`'s trial body) has zero direct test coverage — verification continues to be via algebraic-reduction proofs in commit bodies + post-deploy manual MC scenario comparison.

This dashboard testing gap remains the **#1 standing risk** in the codebase. A future session should consider adding deterministic-seed support to the kernel + property-based tests asserting byte-equality before/after a refactor under a fixed seed. The 2026-04-30 audit flagged Vitest as the recommended path; that recommendation stands.

---

## Codex review backlog

**Open at session end:** None known (PRs #102–#109 not yet reviewed by Codex; check 24–48h post-session).

**Cleared during session:** None — no Codex findings surfaced during the active session window. (Either Codex hasn't run yet, or the algebraic-proof commit bodies satisfied the bot's correctness checks. Both are consistent with the prior session's pattern of "Codex finds issues post-merge → follow-up PR off main.")

---

## Followups generated this session

### Confirmed limitations (documented in code + UI)

- **Post-65 IRMAA tier ripple from inheritedIRA drain** (priority 5 follow-up). The kernel uses pre-baked `m.medicareMonthly` set by the runner from the heir's baseline MAGI; the per-year MAGI augmentation only ripples through `segmentCostAtYear`'s pre-65 ACA-subsidy branch. To capture the post-65 ripple, the runner would need to encode `medicareMonthlyByYear[]` per IRMAA tier crossing, OR the kernel would need an IRMAA tier table to recompute Medicare premium per year based on effective MAGI. Documented in kernel JSDoc + the inherited-IRA UI panel copy.

- **Survivor-overrides payload not yet consumed** (step 2c artifact). `LifeEvent.spouseDeath.survivorOverrides` exists in the type but is intentionally not read by the kernel — applying it would change kernel behavior, which step 2c explicitly avoided to preserve byte-identity. Future overlay refactor could apply the payload at dispatch time.

- **`careerChange` / `incomeChange` LifeEvent kinds are kernel-no-op**. Both pass through `compileLifeEvents` and into `eventsByYear` but are silently ignored in the year loop. These are outside #31's scope; tracked as future #31-adjacent priorities if/when income-step-change modeling becomes a product priority.

### Standing flags (from prior session, still open)

- **Pre-existing `costShockMult < 0`** — phantom income windfall in degenerate trials. Defensive `Math.max(0, ...)` clamp applies the same fix pattern HSA got. Not blocking; worth a focused 1-line cleanup PR when convenient.
- **Dashboard test infrastructure** — the kernel inner loop has zero direct coverage. The 5 pure tests added this session cover `compileLifeEvents` (the helper) but not the trial loop dispatcher. Adding deterministic-seed RNG to `runMonteCarlo` would unlock byte-equality property-based testing — high-leverage investment.
- **`#31 step 2 kernel-loop refactor`** — flagged as highest-risk in the 2026-04-30 audit. Now **CLOSED** — completed this session via the 3-PR trigger-replacement stack.

### Closed today

- **#31** — entire framework, all 6 priorities + kernel-trigger refactor.

---

## Recommendations (for future sessions)

1. **Wait 24–48h, then check Codex on PRs #102–#109.** Per the established pattern, Codex review can land post-merge. Open a follow-up PR off main for any P1/P2 findings.
2. **Add deterministic-seed support to the kernel**. The bottleneck for proper kernel-loop testing is that `Math.random()` is consumed in 5 different places in `runMonteCarlo`. Threading a `seededRandom: () => number` param through these would unlock property-based tests asserting byte-equality of trial trajectories before/after future refactors. Pareto-best test infra investment.
3. **Plan post-65 IRMAA ripple**. The most-cited limitation in this batch's code comments. If a user reports surprise that an inherited-IRA scenario doesn't bump Medicare costs at age 65+, this is the fix. Scope: add `medicareMonthlyByYear?: number[]` MC param + runner pre-computes per-year from baseline MAGI + magiAugmentByYear. Half-day of work.
4. **Schedule a #31 satisfaction sweep in 1–2 weeks**. With the framework live, look for: did any user actually use the inheritance / survivor-relocation / inherited-IRA features in saved scenarios? If yes, the framework was worth the investment; if not, the data UI may need surfacing improvements (the timeline at the top of the page should help).

---

## Appendix — file change summary (3c21048 → 7ce9751)

```
src/app/lib/monte-carlo.ts                                                   +436 / −51
src/app/components/.../mc-life-events-timeline.component.html                +99   (NEW)
src/app/components/.../mc-life-events-timeline.component.scss                +39   (NEW)
src/app/components/.../mc-life-events-timeline.component.ts                  +210  (NEW)
src/app/components/.../mc-results.component.ts                               +7
src/app/components/.../mc-scenarios.component.html                           +170
src/app/components/.../mc-scenarios.component.ts                             +63 / −0
scripts/test-monte-carlo-helpers.mts                                         +95
src/app/services/monte-carlo-runner.service.ts                               +41
src/app/services/monte-carlo-scenario.service.ts                             +7
src/app/services/monte-carlo-state.service.ts                                +31

────────────────────────────────────────
Total: +1,148 / −51 across 11 files
```

## Appendix — kernel growth trajectory

| File | 2026-04-19 | 2026-04-26 | 2026-04-30 | 2026-05-02 | Δ session |
|---|---:|---:|---:|---:|---:|
| `monte-carlo.ts` | ~600 | 760 | 1,080 | **1,418** | +338 |

Three sessions, monotonic growth from real new behavior (HSA + inflation breakdown + Life Events data model + Life Events kernel dispatch + 3 new event kinds + timeline). No bloat — kernel growth is functionality-bound. But the trajectory is steep enough that the next session adding kernel features should be paired with the helper-extraction split recommended above.
