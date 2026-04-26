# SAST/DAST Scan Report — retirement-dashboard-angular

| Field | Value |
|---|---|
| **Date** | 2026-04-26 |
| **Commit** | `a547273` (main) |
| **Scanner** | Manual static analysis (`git diff` + ripgrep) + CI (CodeQL on every PR) |
| **Target** | Angular 21 standalone-component app, signals, no SSR |
| **Previous scan** | `sast-dast-scan-2026-04-24.md` — baseline for delta |
| **Recent merges covered** | 9 PRs since the 2026-04-24 baseline (#54–#62): 5 features + 4 refactors |

---

## Executive Summary

Scope was the 55-file delta (+6,181 / −4,122) since the 2026-04-24 audit. The bulk is the 5-feature Monte Carlo burst (#54 dyscalculia color swap, #55 one-time expenses, #56 LTC, #57 FX shock, #58 essential/discretionary split) plus 4 refactors (#59 LTC stability fix, #60 helper extraction, #61 inline-template extraction, #62 api.model.ts split + shared screen styles). All features are in-browser math; refactors are mechanical reorganisations.

**Counts:** 0 CRITICAL / 0 HIGH / 0 MEDIUM / **2 LOW** (carried forward, unchanged) / **4 INFO** (positive controls, +1 new INFO).

Overall posture: **PASS (no regressions, no new high-severity findings)**. The 2 LOW items are the same CWE-502 localStorage parsing pattern flagged in the prior two audits, in the same two files. Prior recommendation #1 (add a shared schema validator for both `loadSaved()` methods) remains applicable but not regressed.

### Severity counts (open findings, this audit)

| Severity | Count | Delta vs 2026-04-24 |
|---|---:|---:|
| CRITICAL | 0 | 0 |
| HIGH | 0 | 0 |
| MEDIUM | 0 | 0 |
| LOW | 2 | 0 (unchanged carry-forward) |
| INFO | 4 | +1 (new positive control: LTC random sampling uses Math.random, in-band with prior Box-Muller / regime Markov use) |

---

## Methodology

Diff-scoped negative-control sweep, run against `git diff 4f6f307..main -- src/`, restricted to `+` lines. Pattern categories checked (none of which appeared except where noted in this report):

- DOM-write sinks (the inner/outer-HTML setter family, the insert-adjacent variant, and the legacy synchronous DOM-write call)
- Sanitizer escape hatches (Angular's bypass-security family and DomSanitizer escapes)
- Code-execution sinks (the dynamic-eval call, function-constructor invocations, string-bodied timer callbacks)
- Network surface (window.open, XMLHttpRequest, new fetch sites, plain http URLs)
- Env / secrets (process.env reads, password / secret / api-key / token / JWT literals)
- Storage (new localStorage / sessionStorage / JSON.parse sites)
- Randomness (Math.random — 2 hits, see I-2026-04-26-01)
- Escape helpers (net-new function definitions)

CodeQL runs in CI on every PR — all 9 merged PRs in this batch passed `codeql-analysis` and the parallel `CodeQL` check.

---

## Active findings (carried forward, no regression)

### L-2026-04-19-01 — `dyslexia.service.ts` localStorage parse without schema validation

| Field | Value |
|---|---|
| **Severity** | LOW |
| **CWE** | [CWE-502: Deserialization of Untrusted Data](https://cwe.mitre.org/data/definitions/502.html) |
| **Location** | `src/app/services/dyslexia.service.ts:86–89` |
| **Status** | Unchanged from 2026-04-24 baseline |

Pattern: `JSON.parse(localStorage.getItem(KEY) ?? '')` followed by an unchecked `as DyslexiaState` cast. Already wrapped in try/catch with safe fallback to defaults. Blast radius is the user's own browser tab.

### L-2026-04-19-02 — `dyscalculia.service.ts` localStorage parse without schema validation

| Field | Value |
|---|---|
| **Severity** | LOW |
| **CWE** | CWE-502 |
| **Location** | `src/app/services/dyscalculia.service.ts:308–311` |
| **Status** | Unchanged from 2026-04-24 baseline |

Same pattern, same defensive try/catch. Both can be closed by the same shared schema-validator helper.

---

## New INFO (positive control)

### I-2026-04-26-01 — LTC self-insure stochastic sampling uses `Math.random()`

| Field | Value |
|---|---|
| **Severity** | INFO (positive control) |
| **Location** | `src/app/lib/monte-carlo.ts` (LTC start-age + occurrence rolls) |
| **Status** | New use, in-band with prior INFO-tier policy on statistical-only randomness |

Two new `Math.random()` call sites added in #56 (LTC planning) for occurrence-roll and start-age sampling. Consistent with the existing policy: `Math.random()` is fine for statistical sampling (Box-Muller, regime Markov, bootstrap), `crypto.randomUUID()` is used for IDs. No regression.

The #59 follow-up (LTC stability fix) collapses the random rolls to deterministic expected-value paths in single-run modes (historical-sequence, deterministic), so the random surface area is narrower than the new code first introduced — only random in `random` mode at runs > 1.

---

## Negative-control sweep results (additions, this batch)

| Pattern category | Hits in `+` lines |
|---|---:|
| DOM-write sinks | 0 |
| Sanitizer escape hatches | 0 |
| Code-execution sinks | 0 |
| Network surface | 0 |
| Env / secrets | 0 |
| New storage / JSON.parse sites | 0 |
| New escape helper functions | 0 |
| `Math.random()` | 2 (LTC sampling — INFO above) |

All 5 inherited positive controls from the 2026-04-24 audit still hold:
- All raw HTML/SVG emitters (brochure print, MC print HTML + SVG export, report markdown download) pass interpolated fields through 5-entity escape
- All `window.open()` use `noopener,noreferrer`
- `Math.random()` is statistical-only; UUIDs use `crypto.randomUUID()`
- No secrets in `src/environments/*`
- No template-bound raw-HTML attributes, no sanitizer-bypass calls, no DomSanitizer escapes in any source file

---

## Recommendations (carried forward)

The 3 recommendations from 2026-04-24 remain applicable. None are new this cycle:

1. **(LOW mitigation)** Add a hand-rolled or Zod schema validator to both `loadSaved()` methods in `dyslexia.service.ts` and `dyscalculia.service.ts` — closes both LOW findings via one shared helper. CWE-502 mitigation.
2. **(Drift prevention)** Migrate the two remaining in-component `esc()` copies (`brochure-screen.component.ts`, `montecarlo-screen.component.ts:626`) to import from the unit-tested `src/app/lib/text-escape.ts`. Both copies are byte-identical 5-entity escapers — drift is currently latent. Confirmed via `grep -E "function esc\(|const esc\s*=" src/app --include="*.ts" -l` finding 2 hits, no new sites.
3. **(Defense-in-depth)** Consider a Trusted Types CSP header at the hosting layer to convert "no unsafe sinks today" from a property of the source tree into a runtime-enforced invariant.

---

## Verdict

**PASS** — no regressions, no new high-severity findings, all 9 in-batch PRs CI-green (`build-and-check`, `sbom`, `security-audit`, `codeql-analysis`).
