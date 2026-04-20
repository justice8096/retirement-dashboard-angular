# Supply Chain Security Audit
## retirement-dashboard-angular — post-Angular-21 upgrade refresh

| Field | Value |
|-------|-------|
| **Project** | retirement-dashboard-angular |
| **Audit Date** | 2026-04-20 (post-upgrade pass) |
| **Commit** | 009f993 |
| **Branch** | main |
| **Package Manager** | npm |
| **Lockfile** | `package-lock.json` present (v3 format, sha512 integrity) |
| **Dependency Count** | 518 total (10 prod, 499 dev, 127 optional, 22 peer) |
| **SLSA Target** | **L1** (SBOM + hermetic `npm ci` + CI-as-code on SHA-pinned actions) |
| **Type** | Re-audit — supersedes `supply-chain-audit-2026-04-20.md` |

---

## Delta vs 2026-04-20 (morning)

| Indicator | Previous (morning) | Now (post-upgrade) | Change |
|---|---|---|---|
| `npm audit` total | 3 HIGH | **0** | **Cleared** |
| `tar → pacote → @angular/cli` chain (GHSA-34x7-hfp2-rc4v + 5 siblings) | Accepted pending upgrade | **Fixed** | Angular 19→21 upgrade resolved |
| Open GitHub Dependabot alerts | 6 | **0** (all `fixed`) | Auto-closed by upgrade |
| `@angular/core` | 19.2.20 | **21.2.9** | +2 major |
| `@angular/cli` | 19.2.18 | **21.2.7** | +2 major |
| `@angular/material` / `@angular/cdk` | 19.2.x | **21.2.7** | +2 major |
| `typescript` | ~5.7.0 | **~5.9.3** | +1 minor |
| `zone.js` | ~0.15.0 | ~0.15.0 | Unchanged |
| `rxjs` | ~7.8.0 | ~7.8.0 | Unchanged |
| CI workflow | Present (SHA-pinned) | Present (SHA-pinned) | Unchanged |
| SBOM artefact | Present (CycloneDX, 90-day retention) | Present | Unchanged |
| Dependabot enabled | Yes (angular-family group) | Yes (+ 4 GH Actions PRs merged this cycle) | Operating as intended |

**Net:** the single "accept pending upgrade" item from the morning audit is now gone. All Angular runtime + tooling packages sit on 21.2.x with a clean `npm audit` and zero open Dependabot alerts. SLSA L1 posture intact.

---

## Executive Summary

- **Total open advisories**: **0** (HIGH: 0, MODERATE: 0, LOW: 0)
- **Open GitHub Dependabot alerts**: **0** (6 auto-closed as `fixed` after the 19→21 upgrade landed)
- **SLSA level**: **L1** (SBOM via CycloneDX, hermetic `npm ci`, SHA-pinned GitHub Actions, CI-as-code in `.github/workflows/ci.yml`)
- **Direct prod deps**: 15 declared in `package.json` (Angular family × 11, leaflet, rxjs, tslib, zone.js) + 1 dev-type (`@types/leaflet`)
- **Direct dev deps**: 4 (`@angular/build`, `@angular/cli`, `@angular/compiler-cli`, `typescript`)
- **Lockfile**: committed, v3 format, sha512 integrity — reproducible with `npm ci`

Direct production dependencies (what ships to browsers):

| Dependency | Declared | Resolved | Status |
|------------|---------|---------|--------|
| `@angular/{animations,common,compiler,core,forms,platform-browser,platform-browser-dynamic,router}` | `^21.2.9` | `21.2.9` | No advisories |
| `@angular/{cdk,material}` | `^21.2.7` | `21.2.7` | No advisories |
| `leaflet` | `^1.9.4` | `1.9.4` | No advisories |
| `rxjs` | `~7.8.0` | `7.8.x` | No advisories |
| `tslib` | `^2.6.0` | `2.x` | No advisories |
| `zone.js` | `~0.15.0` | `0.15.x` | No advisories |

Direct dev dependencies:

| Dependency | Declared | Resolved | Status |
|------------|---------|---------|--------|
| `@angular/build` | `^21.2.7` | `21.2.7` | No advisories |
| `@angular/cli` | `^21.2.7` | `21.2.7` | **Fixed** — chain that carried 6 CVEs is now clean |
| `@angular/compiler-cli` | `^21.2.9` | `21.2.9` | No advisories |
| `typescript` | `~5.9.3` | `5.9.x` | No advisories (TS 6.0 deferred pending Angular 21 matrix) |

---

## Vulnerability Detail

**None.** `npm audit --json` returns `"vulnerabilities": {}`, metadata counts all zero.

Previously flagged CVEs (resolved this cycle):

| GHSA | Title | Status |
|------|-------|--------|
| GHSA-34x7-hfp2-rc4v | node-tar Arbitrary File Creation via Hardlink Path Traversal | **fixed** |
| GHSA-8qq5-rm4j-mr97 | Arbitrary File Overwrite via Symlink Poisoning | **fixed** |
| GHSA-83g3-92jg-28cx | Arbitrary File Read/Write via Hardlink Target Escape | **fixed** |
| GHSA-qffp-2rhf-9h96 | Hardlink Path Traversal via Drive-Relative Linkpath | **fixed** |
| GHSA-9ppj-qmqm-q256 | Symlink Path Traversal via Drive-Relative Linkpath | **fixed** |
| GHSA-r6q2-hw4h-h46w | Race Condition via Unicode Ligature Collisions | **fixed** |

Root-cause fix path: `@angular/cli@21.2.7` bumps `pacote` past the vulnerable `tar` range. Verified via GitHub's Dependabot alert API — all 6 alerts now in `fixed` state, none `open` or `dismissed`.

---

## Risk Matrix

| Dimension | Status | Notes |
|-----------|--------|-------|
| Dependency pinning | PARTIAL | `package.json` uses `^` / `~`; `package-lock.json` pins exact. Reproducible with `npm ci`. |
| Lockfile integrity | GOOD | v3 format, sha512 hashes, committed to repo |
| Lockfile review in CI | GOOD | `npm ci` runs in `build-and-check` (node 20 + 22 matrix) |
| CI hardening | GOOD | All GitHub Actions SHA-pinned (no floating `@v4` tags); 4 dependabot SHA bumps landed this cycle (#11, #12, #13, #14) |
| Dependency update strategy | GOOD | Dependabot configured with `angular-family` group so all Angular packages move atomically (prevents the Jan 2026 stuck-CLI-bump scenario) |
| SBOM generation | GOOD | CycloneDX emitted per push via `npm sbom`, 90-day artifact retention |
| Signed commits | ABSENT | Unchanged; branch-protection gap |
| Build provenance (SLSA) | L1 | SBOM + hermetic install + build-as-code. Path to L2: attestations via `actions/attest-build-provenance` |
| Private registry | NO | Public npm only |
| `postinstall` audit | GOOD | No install-time lifecycle scripts |
| Secret scanning | GOOD | GitHub secret-scanning + push-protection enabled on the public repo |
| CodeQL | GOOD | Running on every push and PR; latest SHA pinned this cycle (#13) |

---

## SLSA L1 Evidence

1. **Build-as-code**: `.github/workflows/ci.yml` in repo, version-controlled.
2. **Hermetic install**: `npm ci` only (no `npm install` in CI); lockfile is authoritative.
3. **SBOM**: `sbom-cyclonedx.json` uploaded as artifact on every push, 90-day retention. Generated from resolved `package-lock.json`, not from `package.json` alone.
4. **Platform (GitHub Actions)**: hosted runners; runner images pinned implicitly to the latest `ubuntu-latest`.
5. **Action pinning**: all third-party actions SHA-pinned (verified post-cycle after #11/#12/#13/#14 merged the latest SHAs).

---

## Open Governance Gaps (unchanged)

- **SLSA L2**: no provenance attestations yet. Next step: add `actions/attest-build-provenance@<SHA>` after `npm run build`.
- **Commit signing**: enforceable via branch-protection, not yet turned on.
- **Docker**: not applicable to this repo (no Dockerfile; served statically).

---

## Follow-ups

None blocking. The morning audit's one open item ("3 HIGH accepted pending upgrade") is closed. Next scheduled check: after the dyscalculia sweep PR lands (see `audits/acceptance-test-2026-04-20.md` FU-002/004/007/008/011/013 cluster) to confirm no new supply-chain surface is introduced.
