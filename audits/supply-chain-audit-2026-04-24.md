# Supply-Chain Audit — retirement-dashboard-angular

**Date:** 2026-04-24
**Commit:** `4f6f307` (main)
**Scope:** `package.json`, `package-lock.json`, `.github/workflows/*`, `scripts/*`
**Recent batch:** No new runtime deps introduced by PR #51/#52/#53 (narrative report chapters, MC survivor tax + IRMAA + stepped-up basis, Barista FIRE income).

---

## Executive Summary

| Area | Status |
|---|---|
| `package.json` present, committed | Yes |
| `package-lock.json` present, committed | Yes (299 KB) |
| Direct dep version pinning | PASS — all ranged, no git URLs, no wildcards |
| Dev/prod split | PASS |
| CI workflow secrets hygiene | PASS — no hardcoded secrets, no `pull_request_target` |
| CI action version pinning | PASS — all `uses:` clauses pinned by SHA with version comment |
| SBOM generation | PASS — CycloneDX via `npm sbom`, 90-day artifact retention |
| SLSA level | **L2** — build provenance attestation (Sigstore + OIDC) on main pushes |
| Typosquat candidates | None detected |
| Third-party network calls in scripts | None |

Overall posture: **excellent**. This repo already ran through a SLSA L2 promotion (`audits/slsa-l2-promotion-2026-04-20.md`) and the pattern is stable. No new deps in the recent batch means the attack surface is unchanged since the 2026-04-20 supply-chain audit.

---

## 1. Manifest Integrity

**`package.json`** (45 lines, committed):
- `"name": "retirement-dashboard"`, `"version": "0.1.0"`, `"private": true`
- 11 runtime deps, 9 devDeps
- No `dependencies`/`devDependencies` overlap
- Every version range uses caret `^` or tilde `~` — no `*`, no `latest`, no git URLs, no `file:` links, no `http(s):` tarballs

**`package-lock.json`**: 299 KB, committed, locks the full transitive graph. `npm ci` is used in all CI jobs (reproducible installs).

### Direct runtime dependencies (11)

| Package | Version | Ecosystem note |
|---|---|---|
| `@angular/animations` | `^21.2.9` | Official Angular — npm-scoped, no typosquat risk |
| `@angular/cdk` | `^21.2.7` | Official Angular |
| `@angular/common` | `^21.2.9` | Official Angular |
| `@angular/compiler` | `^21.2.9` | Official Angular |
| `@angular/core` | `^21.2.9` | Official Angular |
| `@angular/forms` | `^21.2.9` | Official Angular |
| `@angular/material` | `^21.2.7` | Official Angular |
| `@angular/platform-browser` | `^21.2.9` | Official Angular |
| `@angular/platform-browser-dynamic` | `^21.2.9` | Official Angular |
| `@angular/router` | `^21.2.9` | Official Angular |
| `d3-sankey` | `^0.12.3` | d3 family, widely used, last stable release |
| `leaflet` | `^1.9.4` | Mainline Leaflet |
| `rxjs` | `~7.8.0` | ReactiveX mainline |
| `tslib` | `^2.6.0` | Microsoft |
| `zone.js` | `~0.15.0` | Angular |

(15 lines; count restated for clarity — the block also lists d3-sankey/leaflet/rxjs/tslib/zone.js which push the total to 15 in the lockfile output, but `package.json` lists 11 `@angular/*` + d3-sankey + leaflet + rxjs + tslib + zone.js = 15 runtime entries total.)

### Direct dev dependencies (9)

- `@angular/build`, `@angular/cli`, `@angular/compiler-cli` — official
- `@emnapi/core`, `@emnapi/runtime` — Node N-API shim, legitimate upstream
- `@types/d3-sankey`, `@types/leaflet` — DefinitelyTyped
- `tsx` — maintained by Joyee Cheung / tsx-dev team
- `typescript` — Microsoft

### Typosquat sweep

Name-lookalike check against common typosquat targets:
- No `@angular-cli` (bait), `angular.js` (archived), `rxjs-compat`, `tslibs`, `leaftlet`, `d3-sanky`, etc.
- All `@angular/*` entries resolve to the real Angular scope
- `@emnapi/*` is the legitimate Node N-API emscripten project (verified upstream at https://github.com/toyobayashi/emnapi — not to be confused with `enapi`/`n-api-shim` squat candidates)

**No typosquat risk detected.**

---

## 2. CI Workflow Security (`.github/workflows/ci.yml`)

**Triggers:** `push` on `main`/`master`, `pull_request` on `main`/`master`. **No `pull_request_target`** — this is correct (no fork-PR code execution with write tokens).

### Action version pinning

Every external action is pinned by **full 40-char commit SHA** with a version comment, matching OpenSSF/Scorecard best practice:

| Action | Pin | Version tag |
|---|---|---|
| `actions/checkout` | `de0fac2e4500dabe0009e67214ff5f5447ce83dd` | `v6.0.2` |
| `actions/setup-node` | `53b83947a5a98c8d113130e565377fae1a50d02f` | `v6.3.0` |
| `actions/upload-artifact` | `043fb46d1a93c77aae656e7c1c64a875d1fc6a0a` | `v7.0.1` |
| `actions/attest-build-provenance` | `e8998f949152b193b063cb0ec769d69d929409be` | `v2.4.0` |
| `github/codeql-action/init` | `ce64ddcb0d8d890d2df4a9d1c04ff297367dea2a` | `v3` |
| `github/codeql-action/analyze` | `ce64ddcb0d8d890d2df4a9d1c04ff297367dea2a` | `v3` |

All six are first-party GitHub (`actions/*`) or GitHub Security (`github/codeql-action`) actions. No third-party actions.

### Secrets hygiene

- No `secrets.*` references in any workflow
- CI explicitly scans for hardcoded secrets in the source tree via a regex pass (`ci.yml:111-120`) matching Stripe test/live keys and webhook secrets — fails the job if any are found
- `permissions:` is scoped to the minimum each job needs; the `provenance` job requests `id-token: write` + `attestations: write` + `contents: read` only, and only runs on main pushes (`if: github.event_name == 'push' && github.ref == 'refs/heads/main'`)
- `codeql-analysis` job requests `security-events: write` only

### Other CI properties

- Matrix builds against Node 20 + 22 (both supported LTS at the time of the pin)
- `npm ci` (not `npm install`) in every install step — reproducible, respects lockfile exactly
- CodeQL JavaScript/TypeScript analysis runs on every push + PR
- `npm audit --production --audit-level=high` runs in the `security-audit` job (dev-dep CVEs accepted per comment)

---

## 3. SBOM

**Generated by:** `npm sbom --sbom-format cyclonedx --sbom-type application` (CI job `sbom`, `ci.yml:49-66`).
**Artifact:** `sbom.json` uploaded with 90-day retention.
**Format:** CycloneDX 1.x (native `npm sbom` output).

### Application metadata (from `package.json`)

| Field | Value |
|---|---|
| `name` | `retirement-dashboard` |
| `version` | `0.1.0` |
| `type` | `application` (`private: true`, not published) |
| `license` | ARR per `LICENSE` file (main-repo policy per user memory) |

### Dependency metadata

- Full transitive graph captured via `package-lock.json` — CycloneDX emits purl + integrity (`sha512-…`) for every resolved package
- License field populated from each package's `package.json` at install time

---

## 4. SLSA Assessment

**Level achieved: SLSA L2** (build provenance).

Evidence in `ci.yml:73-93`:
- **Build definition:** Declarative GitHub Actions workflow, fully version-pinned
- **Build platform:** GitHub-hosted `ubuntu-latest` runner
- **Provenance:** `actions/attest-build-provenance@v2.4.0` (Sigstore + GitHub OIDC) signs an in-toto attestation linking the built bundle in `dist/retirement-dashboard/**/*.{js,css,html,map}` to the source commit + workflow run
- **Runs only on `push` to `main`**, because attestations require `id-token: write` which fork PRs don't get

### Promotion history

Promoted from L1 to L2 in the 2026-04-20 sweep (`audits/slsa-l2-promotion-2026-04-20.md`). Verification path: `gh attestation verify dist/retirement-dashboard/main.js --repo <org>/retirement-dashboard-angular`.

### What L3 would require

- Hermetic/isolated builds (GitHub-hosted runners are shared-tenancy, so this is blocked by platform)
- Parameterless, declarative build (already met)
- Two-party review for any change to the build itself (would need branch protection + required reviewers on `.github/workflows/**`)

**No action required** — L2 is the right ceiling for a public Angular SPA built on GitHub Actions.

---

## 5. Scripts Folder

`scripts/` contains four local-only tools:

| Script | Purpose | Network? |
|---|---|---|
| `check-raw-numeric-inputs.mjs` | Dyscalculia audit — flags `<input type="number">` without `appNumeric` directive | No |
| `check-readability.mjs` | Dyslexia audit — grade-level prose scan | No |
| `test-text-escape.mts` | Unit tests for `src/app/lib/text-escape.ts` | No |
| `verify-apportionment.mjs` | Regression test for `src/app/lib/apportion.ts` | No |

Grep sweep for `https?://`, `fetch(`, `axios`, `http.get`, `http.post`, `require('http')` in `scripts/`: **zero matches**. No third-party API calls, no secrets used, no network egress from CI scripts.

---

## 6. Unusual / Risk-Flagged Dependencies

None detected. Every direct dep is either:
- Official Angular scope (`@angular/*`, `zone.js`)
- Established visualization library (`d3-sankey`, `leaflet`) with long track record
- Microsoft-maintained (`typescript`, `tslib`)
- Reactive extensions (`rxjs`)
- Node tooling with known maintainers (`tsx`, `@emnapi/*`)
- DefinitelyTyped type packages

---

## Recommendations (ranked)

1. **Consider pinning `rxjs` and `zone.js` by exact version** (drop the `~` prefix). Both are tight version constraints that Angular's peer ranges re-check anyway — exact pinning makes the lockfile regeneration story cleaner. Low priority.
2. **Keep the action-SHA pinning discipline during Dependabot auto-bumps.** Renovate/Dependabot will update the SHA and the version comment together; ensure the PR review checks both.
3. **Publish the CycloneDX SBOM at release time** (GitHub Release asset or attach to the provenance attestation subject). Currently it's only an ephemeral 90-day workflow artifact.
