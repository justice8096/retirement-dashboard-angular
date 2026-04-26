# Supply Chain Audit — retirement-dashboard-angular (MC split batch)

| Field | Value |
|---|---|
| **Date** | 2026-04-26 (batch 2) |
| **Commit** | `44c6424` (main) |
| **Previous audit** | `supply-chain-audit-2026-04-26.md` — covered PRs #54–#62 |
| **Scope** | Dependency hygiene, lockfile integrity, CI/CD pipeline security, SBOM readiness, SLSA level. |
| **Recent merges covered** | 4 PRs since the prior audit's baseline (#63–#67) — the montecarlo-screen god-component split |

---

## Executive Summary

Supply-chain posture is **strong** and unchanged. **Zero `package.json` / `package-lock.json` diff in the entire 4-PR batch** — the work is pure source reorganisation (state extraction + 4 sub-component carves + 2 service extractions). No new direct deps, no transitive churn, no workflow modifications.

This is the **third consecutive multi-PR batch with zero dep churn** (2026-04-24: PRs #51–#53 dep-clean; 2026-04-26 batch 1: PRs #54–#62 dep-clean; 2026-04-26 batch 2: PRs #63–#67 dep-clean). 22 cumulative PRs without a dep change — the dep tree is in a stable "sustaining" period.

**Best-guess SLSA level: L2** (maintained).

### Key findings

| Check | Status |
|---|---|
| `package.json` modified in batch | **PASS** (0 changes) |
| `package-lock.json` modified in batch | **PASS** (0 changes) |
| `package-lock.json` present and committed | PASS |
| `npm audit --omit=dev` | **PASS — 0 vulnerabilities** (13 prod / 542 dev / 124 optional / 23 peer = 564 total) |
| All direct deps pinned/ranged | PASS — no change since 2026-04-21 baseline |
| `.github/workflows/*` modified | **PASS** (0 changes) |
| All `uses:` in workflows pinned to 40-char SHA | PASS — no workflow changes |
| CycloneDX SBOM generated in CI | PASS (every PR's `sbom` job is SUCCESS) |
| Sigstore-signed SLSA provenance attestation | PASS (skipped on PR-context; runs on main pushes) |

---

## Why zero dep churn this batch

The 4 PRs accomplished a complete god-component decomposition using only existing TypeScript and Angular primitives:

- **#63 (Phase 1)** — extracted state into `MonteCarloStateService` using only `signal`, `computed`, `effect`, `untracked`, `inject` from `@angular/core` (already imported)
- **#65 (Phase 2a)** — created `McResultsComponent` + `CalmRevealService` from existing template + class fragments. New file imports are existing services / models / Angular primitives only
- **#66 (Phase 2b)** — created 3 sibling sub-components (Parameters / Sampling / Scenarios) by mechanically moving template + class fragments. Same import surface
- **#67 (Phase 2c)** — extracted `MonteCarloRunnerService`; moved 2 methods to the state service; dropped facade pass-throughs. No new imports

This is the cleanest possible refactor batch from a supply-chain perspective: the dependency graph is unchanged, attack surface is unchanged, and the only diff at the deps layer is conceptual (one component file is now several files).

---

## CI workflow audit

`.github/workflows/` was not touched. Inherited properties from prior audits hold:

- Every `uses:` pinned to a full 40-char commit SHA
- `actions/attest-build-provenance@v2` produces a Sigstore-signed SLSA L2 attestation on `main`-branch pushes (gated by `github.ref == 'refs/heads/main'` in `.github/workflows/ci.yml:74`)
- CycloneDX SBOM produced on every push with 90-day retention
- `provenance` job correctly skips on PR-context

---

## SLSA L2 confirmation

Maintained from 2026-04-21. Re-verification deferred to next push to main triggering the provenance workflow.

---

## Recommendations

None new. All recommendations from `supply-chain-audit-2026-04-26.md` (none net new in that audit either) remain applicable.

---

## Verdict

**PASS** — supply-chain surface area is strictly the same as the 2026-04-26 audit because no dep / workflow / SBOM-relevant files were touched. Lockfile integrity intact. CI gating intact. Zero advisories on production deps.
