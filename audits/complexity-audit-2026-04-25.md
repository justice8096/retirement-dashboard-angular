# Complexity & Refactoring Audit — 2026-04-25

**Repo:** retirement-dashboard-angular
**Trigger:** post-feature-burst review after 5 Monte Carlo features merged in 24h
(#21 LTC, #23 one-time expenses, #24 essential/discretionary, #26 FX shock,
#30 part-time income).
**Scope:** `src/app/` only. Skipped seed data files (`src/app/data/locations/*`)
since they're JSON-shaped TypeScript, not real complexity.

---

## Executive summary

Codebase grew rapidly during the feature burst and several files have ballooned.
Six refactor opportunities identified across two categories:

1. **Duplication** — same logic / constants / format methods repeated across
   screens. Quick wins.
2. **God components** — `montecarlo-screen.component.ts` at 2,227 LOC was the
   biggest pain point, with 832 LOC of inline template alone.

Five of six refactors were executed in this session and shipped via PRs #60
and #61. The sixth (god-component split into sub-components) was deferred —
correct call given it's a 3–4 week effort that needs its own focused session.

---

## Top 10 oversized files (LOC at audit time)

| # | File | LOC | Primary issue |
|---|------|----:|---------------|
| 1 | `montecarlo-screen.component.ts` | 2,227 | God component — 78 signals/computed, inline template, orchestrates 5 MC features |
| 2 | `location-compare.component.ts` | 1,175 | Massive comparison table — inline template with nested loops, 50+ row-type conditions |
| 3 | `report-screen.component.ts` | 939 | Markdown generation — repeats FIRE/Guardrail math from guardrails-screen |
| 4 | `monte-carlo.ts` (kernel) | 760 | Intentional — single-algorithm file. **DO NOT REFACTOR** |
| 5 | `assumptions-screen.component.ts` | 752 | Form-heavy component — household editor with 8+ field validation paths |
| 6 | `models/api.model.ts` | 628 | Model explosion — 53 exported interfaces. **Optional**: split by domain |
| 7 | `guardrails-screen.component.ts` | 561 | Re-implements FIRE/Guardrail math from report-screen |
| 8 | `healthcare.service.ts` | 536 | Multi-regime service — acceptable, domain-driven |
| 9 | `help-content.ts` | 535 | String literals only — bloats import tree but not real complexity |
| 10 | `sankey-screen.component.ts` | 499 | SVG generation + cash-flow calc + rendering conditional |

---

## High-cyclomatic-complexity hotspots

| File:Line | Function | CC est | Why complex |
|-----------|----------|-------:|-------------|
| `monte-carlo.ts:~150–300` | `runMonteCarloYear()` (inner loop) | **8–12** | Healthcare regime, FX shock, spouse death, LTC, withdrawal phase, inflation — 15+ branches |
| `montecarlo-screen.ts:1893–1975` | `runSimulation()` | **6–8** | 70-arg kernel call, 8 ternaries, healthcare apportion + regime + LTC mode branching |
| `healthcare.service.ts:~389–450` | `decideWithMagi()` | **6–8** | ACA cliff vs enhanced, FPL bracket, Medicare transition, subsidy-eligibility |
| `location-compare.component.ts:~450–550` | table rendering (template) | **7–9** | Healthcare apportionment, year-toggle state, section-header rows, formatters |
| `assumptions-screen.ts:~100–200` | member/pet editor | **5–7** | Role-dependent fields, dependent-type selector, redundant patches |

**Highest risk:** `runMonteCarloYear()` — acceptable only because self-contained.
If MC logic spreads to other files, extract immediately.

---

## Refactor recommendations & status

### ✅ #3 Extract FIRE / Guardrail constants — DONE (PR #60)

**Problem:** `FIRE_WITHDRAWAL_RATE`, `GUARDRAIL_FLOOR`, `GUARDRAIL_CEILING`
duplicated in `report-screen` and `guardrails-screen` under different names
(`BASE_RATE` / `FLOOR_RATE` / `CEILING_RATE`).

**Fix:** New `src/app/lib/fire-math.ts` is the single source of truth.
Exports canonical names (`FIRE_WITHDRAWAL_RATE`, `GUARDRAIL_FLOOR_RATE`,
`GUARDRAIL_CEILING_RATE`) plus a `fireNumber(annualSpend)` helper for the
one non-trivial usage. `guardrails-screen` imports under its existing
local aliases to keep the diff bounded.

### ✅ #1 Extract CurrencyFormatService — DONE (PR #60, scope reduced)

**Problem:** Every screen had its own thin `fmt()` wrapper doing a redundant
`dyscalculia.isEnabled() ? formatCurrency(x) : '$' + ...`. Because
`DyscalculiaService.formatCurrency` already handles the disabled case, the
per-screen check was dead code. Worse, the dyscalculia branch added `'/mo'`
suffix while the fallback didn't — silent inconsistency.

**Fix:** New `src/app/services/currency-format.service.ts` Facade exposes named
methods per unit (`currency`, `currencyMonthly`, `currencyYearly`,
`currencyPrecise`, `currencyShort`) so call sites are explicit.

**Migration:** 6 high-fmt-count screens (montecarlo, location-compare, fees,
taxes, guardrails, assumptions). The audit originally said "8+ screens" but
discovery showed ~25 screens with their own `fmt()`. Most are one-liners; not
worth the 20-file churn for marginal duplication. Decided to migrate only
multi-method offenders. Components keep their `fmt()` methods as thin
delegators to the service so template call sites are unchanged.

**Behavior fixes** from removing the dead-code dyscalculia gate:
- Lump-sum displays now consistent across dyscalculia on/off (no spurious
  `/mo` suffix in dyscalculia mode)
- `fees-screen.fmtUsd` now consistent at 2 decimal precision in both modes
  (was rounding to whole dollars in dyscalculia mode only)

### 🟡 #2 Split `montecarlo-screen.component.ts` — DEFERRED

**Problem:** 2,227 LOC god component, 78 signals, 5 features mixed in.

**Why deferred:** Genuine 3–4 week effort. Would need to split into
sub-components (Parameters, Healthcare, Scenarios, Results) plus a thin
parent. We just shipped 5 features into this file in 24h — code is still
settling. Splitting now would slow follow-on work and risk regressions
right after a feature burst. Re-evaluate after the next feature lull.

### ✅ #4 Move location-cost helpers to LocationService — DONE (PR #60)

**Problem:** `locMonthlyCost` / `locInflationRate` / `locMonthlyCostAtYear`
in MC screen, but they're location-aware not MC-aware — other screens
could reuse.

**Fix:** Moved verbatim to `LocationService`. Template references updated
from `locMonthlyCost(id)` to `loc.locMonthlyCost(id)`. `buildSegmentForLocation`
deliberately left in MC screen — it returns a kernel-shaped segment and
depends on TaxService.

### ✅ #5 Extract MonteCarloScenarioService — DONE (PR #60)

**Problem:** 60-line `scenarioData = {kind: 'monte_carlo_v1', ...}` literal
inline in `saveCurrentScenario()`.

**Fix:** New `src/app/services/monte-carlo-scenario.service.ts` owns the
v1 envelope shape, summary-stat layout, and version constant. Component still
owns prompt / flags / `api.createScenario` subscribe. New
`MonteCarloScenarioParams` type documents what state matters in the snapshot.
Useful when we add a load/apply flow later.

### ✅ Bonus: Extract inline templates for 6 god components — DONE (PR #61)

See the dedicated section below.

---

## Inline templates vs external template files

### Why the codebase used inline templates

Every component originally had `template: \`...\`` and `styles: [\`...\`]` blocks
in the `.ts` file rather than `templateUrl: './foo.component.html'`. This
deviates from the Angular style guide (rule 05-04: "extract templates >3 lines").

The likely reason: **AI-assisted editing prefers single-file components**.
One `Read` gets you class + template + styles, one `Edit` changes everything
atomically. With external files, an AI agent needs:
- Two `Read`s per component (class file + template file)
- Edit calls split across both files when changes touch both layers
- Slightly more ceremony per change

That's a real cost when iterating fast with an LLM. It's also the same reason
some smaller component files in this repo intentionally still inline their
templates — the single-file mental model is genuinely nicer at small scale.

### Why the trade-off flipped for big components

The inline-template benefit collapses once a component crosses ~200 LOC of
template, which six components had. Specifically for the 2,227-LOC
`montecarlo-screen`:

- Class definition is buried under 832 LOC of inline template HTML
- IDE Angular Language Service works better against `.html` files (deeper
  type-checking on bindings, full IntelliSense, separate Prettier formatting)
- Git diffs mix template-only and class-only changes
- Scrolling within the file is dominated by template content
- Cognitive load to find a method definition is high

### Migration done in PR #61

Extracted inline templates + styles for the 6 components with >=200 LOC of
inline template:

| Component | Template LOC | SCSS LOC | .ts before → after |
|-----------|-------------:|---------:|-------------------:|
| montecarlo-screen | 832 | 264 | 2,167 → 1,075 (-50%) |
| location-compare | 537 | 293 | 1,164 → 336 (-71%) |
| assumptions-screen | 427 | 104 | 750 → 217 (-71%) |
| fees-screen | 236 | 64 | 479 → 178 (-63%) |
| settings-screen | 234 | 104 | 489 → 151 (-69%) |
| healthcare-compare-screen | 197 | 119 | 444 → 121 (-73%) |

**Net:** ~3,500 LOC moved out of `.ts` files into co-located `.html` + `.scss`.
The 2,227-LOC god component is now a scannable 1,075-LOC class file (still
big — see #2 above — but readable).

**Smaller components (<200 LOC template) intentionally NOT migrated** —
single-file is genuinely nicer there, and the AI-tooling cost is not worth
paying for marginal readability gain.

**Tool:** `scripts/extract-inline-template.py` kept in the repo — idempotent,
backtick-aware, refuses to clobber existing files. Useful when other
components grow past 200 LOC later.

### Trade-offs to know

- Future AI sessions need 2 `Read`s per migrated component instead of 1 —
  small cost, often offset by smaller individual files
- `git log --follow` flag needed to trace template history across the move
- Mechanical migration — near-zero behavior risk

---

## What NOT to refactor

### `monte-carlo.ts` kernel (760 LOC, 39 branches)

Intentionally monolithic — single, self-contained algorithm. High cyclomatic
complexity is acceptable for a numerical simulation. Tight coupling of logic
*within* the year loop is necessary for correctness.

If a need arises to share MC sub-routines, extract via separate file
(`monte-carlo-helpers.ts`), not by splitting the kernel itself.

### `api.model.ts` (628 LOC, 53 interfaces)

No code complexity — data shapes only. Bundling is acceptable for a single
API contract. Large due to domain breadth (Locations, Healthcare, Tax,
Household), not poor design.

Optional follow-up: organize by domain (`location.model.ts`,
`healthcare.model.ts`), but not urgent.

### `healthcare.service.ts` (536 LOC)

Tightly coupled by design — ACA subsidy logic is inherently multi-regime.
4 private methods are logically cohesive. Size is justified; complexity is
domain-driven, not architectural.

---

## Codex review findings caught & fixed in this session

While shipping the refactors, Codex flagged three issues that were addressed:

| PR | Severity | Finding | Fix |
|----|----------|---------|-----|
| #58 | **P1** | `sumByEssential()` skipped `healthcarePreMedicare` entirely — pre-Medicare households' essential floor was understated | Mirror `nonHealthcareBaseMonthly` pattern: skip both healthcare alternates, add `HealthcareService.decide().monthlyCost` (household-aware effective cost) |
| #57 | **P2** | FX shock gated by `curIsForeign` at trigger time + reset on every move — silently lost for users moving abroad later | Separate durable `fxShockMult` that fires unconditionally, applied only when in foreign segment |
| #59 (1st) | **P2** | LTC self-insure roll non-deterministic in `historical-sequence` mode (single run) — same inputs flipped between "LTC happened" / "didn't" | Switch to expected-value LTC when `effectiveRuns === 1`: always-on at midpoint age, deduction scaled by `ltcProbability` |
| #59 (2nd) | **P2** | First fix collapsed EV LTC to a single midpoint window — biased outcomes since random mode samples start age uniformly | Compute per-year occupancy from start-age distribution: `lowerStart = max(min, oldestAge0 + y - dur + 1)`, `upperStart = min(max, oldestAge0 + y + 1)`, occupancy = overlap / startRange |
| #61 | **P2** | Extraction script wrote `.html` before checking if `.scss` already existed — could leave half-migrated state | Preflight both destinations before writing either file |

Codex was a real net win. Two of the four bugs above (FX shock and LTC
distribution) would have been hard to catch in code review and would have
silently produced wrong simulation results in specific scenarios.

---

## Open follow-ups (not addressed in this session)

1. **#2 god-component split** of `montecarlo-screen` — 3–4 week effort,
   defer to next feature lull
2. **`api.model.ts` domain split** — optional, low priority
3. **Migrate remaining smaller `fmt()` wrappers** — ~20 screens with one-liner
   `fmt()` methods. Low value, high churn. Could be done opportunistically as
   files are touched for other reasons.
4. **CSS-in-JS or component styles audit** — five of six god components had
   inline styles >100 LOC; now extracted but worth a separate pass on whether
   shared styles should hoist to `styles.scss`

---

## Methodology notes

- Initial complexity scan delegated to Explore subagent to keep main-context
  lean (`general-purpose` agent type with thoroughness "very thorough")
- Each refactor was validated by `npx tsc --noEmit` + `npm run check:numeric-inputs`
  before commit
- Browser preview verified on Guardrails screen post-refactor (Essential Floor
  $25,272/yr, Floor 3% $45,000/yr — identical to pre-refactor)
- Each PR ran the full CI suite (build-and-check 20/22, CodeQL, sbom,
  security-audit) and was reviewed by Codex before merge
- Context-conservation discipline: targeted `Grep` + small `Read` slices,
  unique `old_string` for `Edit`, no full-file Reads when avoidable
