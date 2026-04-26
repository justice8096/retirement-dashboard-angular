# SAST/DAST Scan Report — retirement-dashboard-angular (MC split batch)

| Field | Value |
|---|---|
| **Date** | 2026-04-26 (batch 2 — same-day follow-up to the 2026-04-26 audit) |
| **Commit** | `44c6424` (main) |
| **Scanner** | Manual static analysis (`git diff` + ripgrep) + CI (CodeQL on every PR) |
| **Target** | Angular 21 standalone-component app, signals, no SSR |
| **Previous scan** | `sast-dast-scan-2026-04-26.md` — covered PRs #54–#62 |
| **Recent merges covered** | 4 PRs since the prior audit's baseline (#63–#67): full god-component split of montecarlo-screen |

---

## Executive Summary

Scope was the 22-file delta (+2,645 / −2,019) since the 2026-04-26 baseline (`a547273`). All 4 PRs are pure refactoring — no new features, no new dependencies, no new external surface. The work splits a 2,167-LOC god component into 4 sub-components + 3 component-scoped services.

**Counts:** 0 CRITICAL / 0 HIGH / 0 MEDIUM / **2 LOW** (carried forward, unchanged) / **4 INFO** (positive controls; net 0 new — the 1 INFO from the prior audit's batch is unchanged).

Overall posture: **PASS (no regressions, no new high-severity findings, refactor improved structural quality without introducing any new sinks)**.

### Severity counts (open findings, this audit)

| Severity | Count | Delta vs 2026-04-26 baseline |
|---|---:|---:|
| CRITICAL | 0 | 0 |
| HIGH | 0 | 0 |
| MEDIUM | 0 | 0 |
| LOW | 2 | 0 (unchanged carry-forward) |
| INFO | 4 | 0 |

---

## Methodology

Diff-scoped negative-control sweep, run against `git diff a547273..main -- src/`, restricted to `+` lines. Same pattern categories as the 2026-04-26 audit.

CodeQL runs in CI on every PR — all 4 merged PRs in this batch passed `codeql-analysis` and the parallel `CodeQL` check.

---

## Active findings (carried forward, no regression)

The same 2 LOW findings (CWE-502 in `dyslexia.service.ts` + `dyscalculia.service.ts` localStorage parsers) carry forward unchanged. No new instances introduced; no fixes attempted in this batch.

---

## What moved (verifying not "what's new")

The `+` line sweep produced 3 hits, all of which are file-level moves of pre-existing code:

| Hit | Original location | New location | Sink concern? |
|---|---|---|---|
| `// `noopener` severs `window.opener`...` (comment) | `montecarlo-screen.component.ts` | `mc-results.component.ts` | None — comment line |
| `window.open(url, '_blank', 'width=820,height=1000,noopener,noreferrer')` | `montecarlo-screen.component.ts` | `mc-results.component.ts` | None — same call, same `noopener,noreferrer` flags preserved |
| `<svg xmlns="http://www.w3.org/2000/svg" viewBox="..."` | `montecarlo-screen.component.ts` | `mc-results.component.ts` | None — W3C SVG namespace literal, not a network URL |

Zero new sinks introduced.

---

## Negative-control sweep results (additions, this batch)

| Pattern category | Hits in `+` lines | Notes |
|---|---:|---|
| DOM-write sinks | 0 | |
| Sanitizer escape hatches | 0 | |
| Code-execution sinks | 0 | |
| Network surface | 1 | `window.open` move (analyzed above) |
| Env / secrets | 0 | |
| New storage / JSON.parse sites | 0 | |
| New escape helper functions | 0 | The MC `esc()` helper moved with `buildStandaloneSvg` from parent to mc-results — same function, same body, just a relocation |
| `Math.random()` | 0 | |

All 5 inherited positive controls from the 2026-04-26 audit still hold.

### Esc-helper count (carried-forward recommendation #2)

`grep -E "function esc\(|const esc\s*=" src/app --include="*.ts" -l` finds 2 hits — same count as the 2026-04-26 audit, with the MC copy now living in `mc-results.component.ts:226` instead of the parent. Recommendation #2 (migrate both inline copies to `src/app/lib/text-escape.ts`) remains applicable.

---

## Structural improvement (informational)

Although a SAST scan focuses on sinks and surface, this batch is materially structural:

| File | Before (a547273) | After (44c6424) | Δ |
|---|---:|---:|---:|
| `montecarlo-screen.component.ts` | (in flight at 753; was 2,167 pre-Phase-1) | **133** | −82% (vs Phase 1) / −94% (vs Phase 0) |
| `montecarlo-screen.component.html` | 830 | 72 | −91% |
| `monte-carlo-state.service.ts` (new) | — | 425 | new |
| `monte-carlo-runner.service.ts` (new) | — | 172 | new |
| `calm-reveal.service.ts` (new) | — | 54 | new |
| 4 sub-component file trios | — | 1,083 LOC total | new |

The MC parent component drops off the top-10 oversized list entirely (was #1 at 2,227 LOC pre-refactor; now 133 LOC). See the parallel `complexity-audit-2026-04-26-post-mc-split.md` for the refreshed top-10.

---

## Recommendations (carried forward, none new)

1. **(LOW mitigation)** Add a hand-rolled or Zod schema validator to both `loadSaved()` methods in `dyslexia.service.ts` and `dyscalculia.service.ts` — closes both LOW findings via one shared helper. CWE-502 mitigation.
2. **(Drift prevention)** Migrate the two remaining in-component `esc()` copies (`brochure-screen.component.ts`, `mc-results.component.ts:226`) to import from the unit-tested `src/app/lib/text-escape.ts`. Both copies are byte-identical 5-entity escapers.
3. **(Defense-in-depth)** Consider a Trusted Types CSP header at the hosting layer.

---

## Verdict

**PASS** — no regressions, no new high-severity findings, all 4 in-batch PRs CI-green (`build-and-check`, `sbom`, `security-audit`, `codeql-analysis`). The refactor improved code organization substantially without introducing any new sinks; the only `+` line hits in the sweep are file-level moves of pre-existing code with security flags intact.
