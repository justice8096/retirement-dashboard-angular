# Supply Chain Security Audit
## retirement-dashboard-angular

| Field | Value |
|-------|-------|
| **Project** | retirement-dashboard-angular |
| **Audit Date** | 2026-04-19 |
| **Commit** | 86e7fd7 |
| **Branch** | feature/aca-cliff-tax-service-refactor |
| **Package Manager** | npm |
| **Lockfile** | `package-lock.json` present (v3 format) |
| **Dependency Count** | 500 total (19 prod, 482 dev, 107 optional, 0 peer) |
| **SLSA Target** | L0 (no build provenance today) |
| **Type** | Initial audit |

---

## Executive Summary

`npm audit` reports **3 HIGH severity vulnerabilities**, all transitive and confined to the **dev-only** Angular CLI tooling chain (`tar → pacote → @angular/cli`). None affect runtime production bundles — `tar` is used during `npm install` / package extraction and never ships to the browser. Recommended posture: **accept for now, track for next dep bump**, because the only fix path (`npm audit fix --force`) installs `@angular/cli@21.2.7` which is a major-version upgrade (Angular 21) that also requires moving `@angular/core`, `@angular/common`, `@angular/material`, `@angular/cdk`, etc. from v19 → v21 (a two-major-step jump that will touch every component).

Direct production dependencies (the ones that ship to the browser) are **clean**:

| Dependency | Declared | Resolved | Status |
|------------|---------|---------|--------|
| `@angular/*` (core, common, forms, router, animations, platform-browser, platform-browser-dynamic, compiler, cdk, material) | `^19.2.0` | `19.2.19 / 19.2.20` | No advisories |
| `leaflet` | `^1.9.4` | `1.9.4` | No advisories |
| `@types/leaflet` | `^1.9.21` | `1.9.21` | dev types only |
| `rxjs` | `~7.8.0` | `7.8.2` | No advisories |
| `tslib` | `^2.6.0` | `2.8.1` | No advisories |
| `zone.js` | `~0.15.0` | `0.15.1` | No advisories |

---

## Vulnerability Detail

### HIGH-1 — `tar < 7.5.10` — 6 CVEs chained

- **Dependency path**: `@angular/cli → pacote → tar` (dev-dep, build-time only)
- **CWEs**: CWE-22 (Path Traversal) × 4, CWE-59 (Link Following), CWE-176 (Improper Unicode), CWE-367 (TOCTOU Race)
- **CVSS**: 7.1 – 8.8 (HIGH)

Advisories:

| GHSA | Title | CVSS |
|------|-------|-----:|
| GHSA-34x7-hfp2-rc4v | node-tar Arbitrary File Creation/Overwrite via Hardlink Path Traversal | 8.2 |
| GHSA-8qq5-rm4j-mr97 | Arbitrary File Overwrite and Symlink Poisoning via Insufficient Path Sanitization | n/a |
| GHSA-83g3-92jg-28cx | Arbitrary File Read/Write via Hardlink Target Escape Through Symlink Chain | 7.1 |
| GHSA-qffp-2rhf-9h96 | Hardlink Path Traversal via Drive-Relative Linkpath | n/a |
| GHSA-9ppj-qmqm-q256 | Symlink Path Traversal via Drive-Relative Linkpath | n/a |
| GHSA-r6q2-hw4h-h46w | Race Condition in Path Reservations via Unicode Ligature Collisions on macOS APFS | 8.8 |

**Exposure reality:** These are triggered only when extracting a malicious tarball. In this project, tar is invoked by `pacote` during `npm install` to unpack npm registry tarballs. Risk applies if a registry package is compromised (e.g., namespace-squat / typosquat of an Angular scope package). With a clean lockfile and HTTPS-pinned registry, the realistic exposure is low — but the weakness exists on the developer machine and in any CI runner.

### HIGH-2, HIGH-3 — `pacote` and `@angular/cli` (transitive effects of the above)

Same blast radius as HIGH-1. Fix arrives in `@angular/cli@21.2.7` which bumps pacote past the affected range.

---

## Risk Matrix

| Dimension | Status | Notes |
|-----------|--------|-------|
| Dependency pinning | PARTIAL | `package.json` uses `^` (caret) for most deps; `package-lock.json` pins exact versions. Reproducible with `npm ci`, not with `npm install`. |
| Lockfile integrity | GOOD | `package-lock.json` committed; lockfile v3 format includes sha512 integrity hashes. |
| Lockfile review in CI | N/A | No CI configured (no `.github/workflows`, no `.gitlab-ci.yml`). |
| Dependency update strategy | NONE DOCUMENTED | No `renovate.json` or Dependabot config in repo. |
| SBOM generation | ABSENT | No CycloneDX / SPDX SBOM artifact produced by build. `@angular/build` does not emit one by default. |
| Signed commits | ABSENT | Git log shows no `gpgsig` entries; commits are not signed. Matches user preference of no `--no-gpg-sign` override. |
| Build provenance (SLSA) | L0 | No attestation, no reproducible builds, no hermetic build environment. |
| Private registry / scoped install | NO | Uses public npm registry only. Good — no private proxy spoofing risk. |
| `postinstall` script audit | GOOD | `package.json` has no `postinstall`, `preinstall`, or lifecycle scripts. |
| Dev vs runtime separation | GOOD | All 3 CVEs are in devDependencies — not shipped. |
| Outdated deps | SMALL DRIFT | Angular 19 → 21 is 2 majors behind current (Angular 21 GA as of late 2025). |

---

## Framework Compliance Table

### SLSA v1.0

| Level | Requirements | Status |
|------:|-------------|--------|
| **L0** | No guarantees | ✓ current state |
| **L1** | Scripted build, provenance exists but unsigned | ✗ no provenance |
| **L2** | Hosted build service + signed provenance | ✗ no CI |
| **L3** | Hardened build, non-forgeable provenance | ✗ |
| **L4** | Two-party review, hermetic & reproducible | ✗ |

**Path to L1:** add a GitHub Actions workflow that runs `npm ci && npm run build` on push to `main`, publish `npm sbom --sbom-format cyclonedx > sbom.json` as an artifact, and attach the build SHA. Effort: ~45 min.

### NIST SP 800-218A (Secure Software Development — SSDF for AI)

| Practice | Status | Gap |
|----------|--------|-----|
| PS.1 — Protect code | PARTIAL | Repo is on GitHub private/public (unknown here); no branch-protection config in-repo to verify. |
| PS.3 — Archive & protect releases | N/A | No tagged release yet. |
| PW.4 — Reuse secure software | GOOD | Only well-known deps (Angular, Material, Leaflet, RxJS, Zone.js). No homemade forks. |
| PW.5 — Create source code secure | GOOD | TS strict-mode project (verify in `tsconfig.json`); no native code or WASM. |
| PW.6 — Configure compilation | GOOD | `angular.json` sets `outputHashing: all` for prod (cache-busting), budgets enforced (500 kB warn / 1 MB error). |
| PW.7 — Review & analyze code | PARTIAL | Human review via PR (#6 in flight); no automated SAST in CI. |
| PW.8 — Test executable code | GAP | `npm test` script exists but no tests in repo (no `*.spec.ts` files observed in app tree). |
| PW.9 — Configure sw for secure deployment | PARTIAL | Prod env uses `/api` (same-origin); no CSP / security headers in-repo. |
| RV.1 — Identify vulnerabilities | PARTIAL | `npm audit` runnable; no scheduled automation. |
| RV.2 — Assess & remediate | PARTIAL | No triage doc, no SLA for fix velocity. This audit is the first formal record. |
| RV.3 — Analyze root cause | N/A | No incidents yet. |

### EU AI Act Art. 25 (Supply Chain)

Not a general-purpose AI system — app uses Claude only at development time, not at runtime. Art. 25 applies indirectly to the **developer tooling** (Claude Code, which is subject to its own provider controls). Project itself is out of scope for AI Act.

### ISO 27001 A.15 (Supplier Relationships)

| Control | Status | Gap |
|---------|--------|-----|
| A.15.1.1 — Info-sec policy for supplier relationships | N/A | Single-developer project; implicit "trust public npm registry" policy. |
| A.15.1.2 — Addressing security in supplier agreements | N/A | No commercial suppliers. |
| A.15.1.3 — ICT supply chain | PARTIAL | No SBOM, no continuous monitoring. |
| A.15.2.1 — Monitor supplier services | GAP | No Dependabot / Renovate / Snyk integration. |
| A.15.2.2 — Manage changes | PARTIAL | Manual review of `package.json` diffs in PRs. |

---

## Recommendations

Ranked by cost / benefit ratio:

1. **Add Dependabot or Renovate** (5 min): drop `.github/dependabot.yml` with a weekly schedule for `npm`. Will surface the Angular 19 → 20 → 21 upgrade path as PRs instead of a single cliff.
2. **Add GitHub Actions workflow** (30 min): `npm ci && npm audit --audit-level=high && npm run build` on every push to `main` and every PR. Publish the bundle size & audit output as PR comments. This is SLSA L1.
3. **Emit SBOM** (10 min added to the workflow): `npm sbom --sbom-format cyclonedx --sbom-type application > dist/sbom.json` and publish as a build artifact.
4. **Schedule Angular 19 → 20 upgrade** next feature-slack window (~1–2 days): `ng update @angular/core@20 @angular/cli@20`. This unblocks the 21 jump that eventually clears the tar CVEs.
5. **Enable branch protection on `main`** (GitHub UI, 2 min): require PR + 1 reviewer + passing checks; disallow force-push. Not reflected in audit-able files but important.
6. **Add a SECURITY.md** (15 min): disclosure contact, supported versions, expected response SLA. NIST PW.1 gap closer.
7. **Run `npm test` infrastructure**: add at least one smoke test (`ApiService.getHealth` mock → expect Observable) so the CI bar has something to fail on.

---

## Residual Risk Statement

As of 2026-04-19, the project carries **3 HIGH-severity dev-dep vulnerabilities** in the Angular CLI tooling chain, all non-runtime. The runtime bundle (what browsers actually execute) has **zero known advisories**. Recommend accepting the 3 dev-dep CVEs until the next Angular major upgrade cycle, with the mitigations:

- Developer machines should keep OS up to date (path-traversal payloads in tar extraction need a hostile tarball first; the realistic attack path is a compromised npm package being installed).
- CI, if/when added, should run on ephemeral runners that don't retain state between jobs.
- Never run `npm install` against an unpinned lockfile from an untrusted source.

SLSA level: **L0** (current) → **L1** achievable in ~45 min of CI work.
