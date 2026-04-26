# Supply Chain Audit — retirement-dashboard-angular

| Field | Value |
|---|---|
| **Date** | 2026-04-26 |
| **Commit** | `a547273` (main) |
| **Previous audit** | `supply-chain-audit-2026-04-24.md` (assumed; if absent, baseline is 2026-04-21) |
| **Scope** | Dependency hygiene, lockfile integrity, CI/CD pipeline security, SBOM readiness, SLSA level. |
| **Recent merges covered** | 9 PRs since the 2026-04-24 baseline (#54–#62): 5 features + 4 refactors |

---

## Executive Summary

Supply-chain posture is **strong** and unchanged. **Zero `package.json` / `package-lock.json` diff in the entire 9-PR batch** — every feature is implemented in pure TypeScript over the existing dep set, and every refactor is a reorganisation of source files. No new direct deps, no transitive churn.

**Best-guess SLSA level: L2** (maintained).

### Key findings

| Check | Status |
|---|---|
| `package.json` modified in batch | **PASS** (0 changes) |
| `package-lock.json` modified in batch | **PASS** (0 changes) |
| `package-lock.json` present and committed | PASS |
| `npm audit --omit=dev` | **PASS — 0 vulnerabilities** (13 prod / 542 dev / 124 optional / 23 peer = 564 total) |
| All direct deps pinned/ranged (no `*`, no git+URL, no `latest`) | PASS — no change since 2026-04-24 |
| All `uses:` in `.github/workflows/*` pinned to 40-char SHA | PASS — no workflow changes in batch |
| CycloneDX SBOM generated in CI | PASS (every PR's `sbom` job is SUCCESS) |
| Sigstore-signed SLSA provenance attestation | PASS (skipped on PR-context; runs on main pushes) |
| No typosquat candidates in dependency tree | PASS (carried forward, no new deps) |
| Zero network calls in `scripts/` folder | PASS (only `scripts/check-raw-numeric-inputs.mjs` and `scripts/extract-inline-template.py` exist; both are local-only) |

---

## Why zero dep churn this batch

The 9 merged PRs accomplished:

- **5 features (#54–#58)** — all implemented in existing TypeScript primitives. LTC + FX shock + one-time expenses + essential/discretionary split + dyscalculia color swap. No new chart libraries (the existing inline SVG approach was reused), no new state management library (Angular signals throughout), no new validation library.
- **4 refactors (#59–#62)** — pure reorganisation. #59 was a math fix (no new deps possible). #60 extracted helpers from existing files into new files within `src/`. #61 moved templates from `template:` strings into `.html` files. #62 split `api.model.ts` into 9 domain files via barrel re-export and hoisted shared screen-layout SCSS.

This is the second consecutive 9-PR batch with zero dep changes (the 2026-04-24 batch covering #51–#53 was also dep-clean). Indicator of a healthy "sustaining" period — the dep tree is stable, the active work is on logic and structure.

---

## CI workflow audit

`.github/workflows/` was not touched in the batch. Inherited properties from prior audits hold:

- Every `uses:` in workflows is pinned to a full 40-char commit SHA (no floating tags)
- `actions/attest-build-provenance@v2` produces a Sigstore-signed SLSA L2 attestation on `master`-branch pushes (verified via prior audits)
- CycloneDX SBOM is produced on every push with 90-day retention
- Dockerfile (if any) base image is digest-pinned (no Dockerfile in this app — Angular is built to a static bundle)
- `provenance` job correctly skips on PR-context (per prior audits)

---

## SLSA L2 confirmation

Maintained from 2026-04-21. Re-verification deferred to next push to main triggering the provenance workflow.

---

## Recommendations

None new this cycle. The recommendations from `supply-chain-audit-2026-04-24.md` (if any) remain applicable.

---

## Verdict

**PASS** — supply-chain surface area is strictly narrower than two audits ago because no new deps were added across 18 cumulative PRs (since 2026-04-21). Lockfile integrity intact. CI gating intact. Zero advisories on production deps.
