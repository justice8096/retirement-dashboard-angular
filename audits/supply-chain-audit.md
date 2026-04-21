# Supply Chain Audit — 2026-04-21

## Delta from 2026-04-20 baseline

**Posture: maintained at SLSA L2 with one finding raised and remediated in-audit.**

Since the 2026-04-20 baseline, the following material changes landed:

- `d3-sankey@0.12.3` and `@types/d3-sankey@0.12.5` added (new deps, CashFlow Sankey screen).
- `leaflet@1.9.4` usage activated (was installed, now imported by Location Map screen).
- `@types/d3-sankey` and `@types/leaflet` were initially placed in `dependencies` — **remediated in this audit cycle** (moved to `devDependencies`).

---

## npm audit summary

Runtime production deps (`npm audit --omit=dev`): **0 vulnerabilities.**

---

## New / newly-activated deps

| Package | Version | License | Pinning | Status |
|---|---|---|---|---|
| `d3-sankey` | 0.12.3 | BSD-3-Clause | `^0.12.3` | FLAGGED — last release ~7 years ago (2018). Accepted, see SC-2026-04-21-002. |
| `@types/d3-sankey` | 0.12.5 | MIT | `^0.12.5` (**devDep**) | OK — moved to `devDependencies` during this audit. |
| `leaflet` | 1.9.4 | BSD-2-Clause | `^1.9.4` | OK — actively maintained; 2.0.0-alpha released 2025-08. |
| `@types/leaflet` | 1.9.21 | MIT | `^1.9.21` (**devDep**) | OK — moved to `devDependencies` during this audit (was misplaced from earlier install). |

Transitive deps via `d3-sankey`: `d3-array@2.12.1`, `d3-path@1.0.9`, `d3-shape@1.3.7`. All BSD-3-Clause, no advisories.

---

## SLSA assessment

**Level: 2** (maintained from baseline).

The `provenance` job in `ci.yml` runs `actions/attest-build-provenance` (SHA-pinned) on every push to `main`, signing with Sigstore OIDC. Today's dep additions did not modify `ci.yml` — no regression.

---

## Risks / actions

### ✅ SC-2026-04-21-001 — `@types/*` in `dependencies` — **RESOLVED**

**Severity at detection:** HIGH
**Status:** fixed in this audit cycle.

Both `@types/d3-sankey@0.12.5` and `@types/leaflet@1.9.21` were in `package.json` `dependencies`. Type-declaration packages are compile-time only and must not ship in the production bundle. Moved via:

```
npm uninstall @types/d3-sankey @types/leaflet
npm install --save-dev @types/d3-sankey @types/leaflet
```

Verified post-fix: 0 `@types/*` packages remain in `dependencies`. Runtime dependency surface is now accurate.

### 🟡 SC-2026-04-21-002 — `d3-sankey` maintenance status [MEDIUM, accepted]

`d3-sankey@0.12.3` last published ~7 years ago (2018). Exceeds the 18-month maintenance flag threshold. The Sankey layout algorithm is well-specified and unlikely to change, and no current CVEs exist, but the package will not receive security patches if a vulnerability is found.

**Decision:** accept for now; add to next quarterly dep review. Mitigations if risk grows:
- Vendor the ~200-line source into `src/lib/d3-sankey/` and own the maintenance surface.
- Migrate to `d3-sankey-circular` or a Canvas/WebGL alternative.

### 🔵 Note — `--production` flag in `security-audit` CI job [LOW, deferred]

`.github/workflows/ci.yml` uses `npm audit --production`, deprecated since npm v7 in favor of `--omit=dev`. Functionally equivalent today; replace with `npm audit --omit=dev --audit-level=high` at next CI touch.

---

## SBOM delta

- `d3-sankey@0.12.3` — added (new, prod dep, BSD-3-Clause)
- `@types/d3-sankey@0.12.5` — added (new, **devDep** after fix, MIT)
- `d3-array@2.12.1` — added (transitive, BSD-3-Clause)
- `d3-path@1.0.9` — added (transitive, BSD-3-Clause)
- `d3-shape@1.3.7` — added (transitive, BSD-3-Clause)
- `leaflet@1.9.4` — no lockfile change; usage activated in source
- `@types/leaflet@1.9.21` — moved from `dependencies` to `devDependencies`

License compatibility: all BSD-2-Clause, BSD-3-Clause, or MIT. Compatible with the project's custom "All Rights Reserved" license.

---

**Overall: PASS.** Zero production vulnerabilities. One HIGH raised and fixed mid-audit. One MEDIUM accepted with rationale. SLSA L2 maintained.
