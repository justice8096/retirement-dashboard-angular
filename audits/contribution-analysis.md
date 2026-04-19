# Contribution Analysis Report
## retirement-dashboard-angular

**Report Date**: 2026-04-19
**Project Duration**: ~4 months of commits in-repo (initial commit `fd8b4ec` through `86e7fd7`)
**Contributors**: Justice (Human — `justice8096@gmail.com`) · Claude Opus 4.7 (AI Assistant, dev-time only)
**Deliverable**: Angular 19 retirement-planning SPA with 33 screen components, 10 services, Monte Carlo simulation kernel, multi-location move modeling, ACA/Medicare healthcare regime logic, dyslexia + dyscalculia accommodation layer, and first full security-and-compliance audit suite (this set).
**Audit Type**: Initial (first contribution analysis; prior `audits/` only contained two a11y audits)
**Commit**: 86e7fd7 on `feature/aca-cliff-tax-service-refactor`
**Commit Count**: 20 commits total; 9 carry `Co-Authored-By: Claude Opus 4.7` trailer

---

## Executive Summary

**Overall Collaboration Model**: **Director–Implementer with human architectural ownership.** Justice makes every strategic decision (what to build, what the domain model should look like, which retirement-planning regimes to implement, which a11y accommodations to support, what to accept as residual risk). Claude implements code to specification, drafts commit messages, runs audits, and writes prose documents. Every line is committed by Justice after review.

**Contribution Balance**:

- **Architecture & Design**: 90 / 10 (Justice / Claude)
- **Code Generation**: 25 / 75 (Justice / Claude)
- **Security Auditing**: 20 / 80 (Justice / Claude)
- **Remediation Implementation**: N/A yet (first audit)
- **Documentation**: 30 / 70 (Justice / Claude)
- **Testing & Validation**: 85 / 15 (Justice / Claude)
- **Domain Knowledge**: 70 / 30 (Justice / Claude)
- **Overall (weighted)**: **~55 / 45** (Justice / Claude)

Justice is clearly in the driver's seat on *what* and *whether*; Claude does the majority of the *how*-typing.

---

## Attribution Matrix

### Dimension 1: Architecture & Design — 90 / 10

**Justice:**
- Chose Angular 19 (standalone components, signals-based state) as the framework. Matches current Angular best practice post-v17.
- Designed the screen hierarchy — 33 screens grouped under `components/screens/`, mirroring the navigation model in `models/navigation.model.ts`.
- Decided the separation of concerns between `LocationService` (state + filtering), `TaxService` (pure bracket math), `HealthcareService` (age-aware regime decisions), and the `monte-carlo.ts` lib (pure simulation kernel).
- Made the `monte_carlo_v1` envelope design for scenario persistence — a versioned data contract between MC screen and scenarios screen.
- Decided on backend contract shape (REST `/api/me/*` and `/api/locations/*` with paginated list + supplement pattern).
- Decided the a11y architecture: dyslexia + dyscalculia as sibling accommodation services that write CSS custom properties to `:root`, scoped by `.dx-enabled` / `.dy-enabled` classes (verified in `dyslexia.service.ts:146-167`).
- Rejected the ACA "dual-regime with toggle" approach early — see `MEMORY.md` → `aca-subsidy-regime.md`; post-hoc change to `cliff` + `enhanced` pair came from real-world regime shift in 2025. Architecture absorbed this cleanly.

**Claude:**
- Suggested specific Angular patterns when asked (e.g., using `computed()` over a manual subscribe, using `@for` with `track` for performance).
- Implemented the decided architecture — e.g., filled in the signal/computed wiring after Justice specified the shape.
- Drafted component-to-service boundaries in specific cases (the `TaxService` extraction from `LocationService` was Justice's call; Claude generated the refactor mechanics).

**Evidence**: Commit `d55c22f` message body explicitly describes the TaxService extraction motivation and boundary rules in Justice's voice. Commit `86e7fd7` documents the climate/visa schema fix — a domain-model decision by Justice.

---

### Dimension 2: Code Generation — 25 / 75

**Justice:**
- Hand-wrote portions of the initial setup (`fd8b4ec` initial commit).
- Rewrote or heavily edited AI output on domain-sensitive files — particularly `tax.service.ts` brackets and `healthcare.service.ts` ACA cliff percentages (these match IRS §36B sliding scale precisely, which requires human cross-check).
- Rejected Claude suggestions that drifted from the `Number(x) || 0` Prisma-string discipline (see `MEMORY.md` → `prisma-string-fields.md`) and redirected.

**Claude:**
- Wrote the bulk of the ~10,500 LOC across 75 TS files. Signal patterns, template strings, style blocks, and boilerplate are AI-drafted.
- Wrote the `monte-carlo.ts` simulation kernel (454 lines) per Justice's spec: four sampling modes (normal / bootstrap / regime / historical-sequence), multi-location moves with FX drift, age-aware healthcare line item, spouse-death modeling.
- Wrote the inline templates and styles in each screen component.
- Wrote the commit message bodies (the multi-paragraph structure of `86e7fd7` and `d55c22f` commit messages is characteristic AI-drafted output).

---

### Dimension 3: Security Auditing — 20 / 80

**Justice:**
- Directed the audit to run (this invocation).
- Will interpret findings, decide which to fix, which to accept.
- Made the prior decision to accept `aca-subsidy-regime.md` ambiguity — not a security call but demonstrates decision ownership.

**Claude:**
- Ran the SAST sweep (ripgrep passes over the codebase).
- Ran `npm audit` and interpreted the JSON output.
- Generated the 6-document audit suite (this report included).
- Mapped CWE IDs, CVSS vectors, and 8-framework compliance tables.

---

### Dimension 4: Remediation Implementation — N/A

No remediation cycle has been run yet — this is the initial audit. Section will populate on the next re-audit cycle.

---

### Dimension 5: Testing & Validation — 85 / 15

**Justice:**
- Manually tested the app in-browser across the 33 screens (per commit messages like `86e7fd7` referencing "Follow-ups discovered during user review").
- Confirmed dyscalculia + dyslexia settings work end-to-end across screens.
- Validated ACA subsidy calculations against personal reference points (MAGI scenarios).
- Is the only party who can sign off on "no regressions."

**Claude:**
- Ran linters / type-check implicitly through the Angular compiler during dev iteration.
- Did not author unit tests — there are no `*.spec.ts` files in the app tree beyond what `ng new` scaffolds.

**Gap:** The most obvious weakness of the project — **no automated test suite** — is a shared responsibility. Testing work has been deferred in favor of feature velocity. Recommend adding at least:
- Snapshot test on `TaxService.applyBrackets` vs known IRS outputs.
- Unit test on `monte-carlo.ts` kernel with a fixed seed and known statistical properties.
- Smoke test on `ApiService` with a mocked backend.

---

### Dimension 6: Documentation — 30 / 70

**Justice:**
- Wrote `MEMORY.md` and its linked pages (`aca-subsidy-regime.md`, `prisma-string-fields.md`, `obsidian-vault.md`).
- Dictated the voice and scope of the two existing a11y audits (2026-04-16).
- Would write a README if one existed (currently absent).

**Claude:**
- Wrote the two a11y audits (2026-04-16).
- Wrote this audit suite (6 files totaling ~1,500 lines of analysis prose).
- Wrote the multi-paragraph commit message bodies on the big feature commits.
- Would draft a README and `SECURITY.md` on request.

**Gap:** No user-facing README, no LICENSE file visible, no SECURITY.md. Easy lifts.

---

### Dimension 7: Domain Knowledge — 70 / 30

**Justice (domain expert):**
- Retirement planning and FIRE math — bucket strategies, withdrawal rules, Monte Carlo failure-mode framing.
- US tax regime specifics — bracket-based federal tax, state-level variations, Roth conversion sequencing.
- Healthcare — ACA cliff vs enhanced subsidy law, Medicare integration at 65, MAGI management between early retirement and Medicare.
- Personal context — the specific scenarios (multi-location moves, spouse ages, target MAGI ranges) that shaped the simulation design.

**Claude (framework-level knowledge):**
- Angular 19 idioms and signal-based patterns.
- Material Design 3 component APIs.
- Leaflet map integration.
- CWE / OWASP / NIST cross-referencing for this audit.
- Web accessibility standards (WCAG, ARIA, IDA dyslexia heuristics).
- RxJS 7.8 operator selection and fetch patterns.

Justice owns the *problem*; Claude helps navigate the *solution space*.

---

## Quality Assessment

| Criterion | Grade | Notes |
|-----------|:-----:|-------|
| Code Correctness | B+ | No observed bugs in the audit; typed throughout; signals used correctly. Only B+ because no automated tests exist to guarantee it under future refactors. |
| Test Coverage | D | Zero unit tests in the app tree. The dep budget is enforced (500 kB warn / 1 MB error) which provides a weak correctness signal via build success. |
| Documentation | C+ | Excellent in-code documentation (JSDoc-style service-level docstrings on `healthcare.service.ts`, `tax.service.ts`, `location.service.ts`, `monte-carlo.ts`). Weak at the project surface: no README, no LICENSE, no CONTRIBUTING, no SECURITY.md. |
| Production Readiness | B- | Would need: (1) backend URL configured at deploy time, (2) CSP header at hosting layer, (3) M-01 tabnabbing fix, (4) error telemetry, (5) a couple of smoke tests in CI. All 1–2 day of work. Ship-ready for private beta today. |
| **Overall** | **B** | Good — functional and production-capable with ~1 week of hardening. |

---

## Key Insight

**The human–AI collaboration here is disciplined and productive.** The evidence is:

1. **Architectural coherence.** The service boundaries are principled and the data flow is one-directional (TaxService → LocationService, not circular). This is characteristic of human-architected, AI-implemented code rather than AI-drafted-from-scratch code (which tends toward sprawling cross-dependencies).
2. **Domain accuracy.** The ACA cliff percentages in `tax.service.ts` are correct to IRS §36B — Claude would have been able to generate plausible-looking but subtly wrong numbers without a human checking. Commit `d55c22f` explicitly notes the post-fix regime alignment.
3. **Accommodation depth.** Dyslexia and dyscalculia services go beyond box-checking into thoughtful patterns (bionic-reading segmentation, natural-frequency phrasing, tone mapping that avoids `danger` to prevent math anxiety). This is a human design decision; Claude implemented it.
4. **Residual-risk honesty.** The user's `MEMORY.md` documents prior decisions (ACA enhanced-only → revised to cliff+enhanced) as real tradeoffs rather than glossing over them. This context-transfer is what enables Claude to be useful across sessions.

**The weakness** — and it's a solo-dev project weakness, not an AI-collab weakness — is absent automated testing. This is the single largest ROI improvement.

---

## Recommendations for the Collaboration Workflow

1. **Standardize AI attribution in commits.** 11 of 20 commits lack the `Co-Authored-By: Claude Opus 4.7` trailer. Configure `git commit.template` to include it by default; strip manually if a commit was 100% human. This closes Dimension 1 (Transparency) of the LLM compliance report.

2. **Write a `docs/AI-USE.md`.** One page, pins the model version, lists the domains Claude contributed to (framework idioms, simulation math scaffolding, audit prose) and domains Justice owns (architecture, domain math accuracy, residual-risk acceptance).

3. **Add a test scaffolding session.** Claude can write 20-30 unit tests against `tax.service.ts`, `healthcare.service.ts`, and `monte-carlo.ts` in a single session — these are pure-function cores that test well. This moves Test Coverage from D to B.

4. **Run the audit suite on a cadence.** Every major PR merge (currently PR #6) or monthly, whichever comes first. Each run generates a delta table against the previous audit, so the LLM compliance score can trend upward measurably.

5. **Keep `MEMORY.md` as the context bridge.** The prisma-string-fields and aca-subsidy-regime notes are exactly the right artifact to prevent cross-session regressions. Add one for "no innerHTML / no bypassSecurityTrust — always prefer Angular template binding" to codify the defensive posture that the SAST scan found.

---

## Appendix: Commit Roster

Commits where `Co-Authored-By: Claude Opus 4.7` trailer is present (9 of 20):

| SHA | Subject | Scope |
|-----|---------|-------|
| 86e7fd7 | fix: climate/visa display, tax-to-cents, dyscalculia on taxes+roth | Screen polish + follow-ups |
| d55c22f | feat: ACA cliff regime, MAGI planning, scenarios save/compare, refactor tax | Major feature + refactor |
| ed89580 | feat: age-aware healthcare + MAGI + multi-location MC schedule | Major simulation work |
| 37e6ebb | chore: gitignore ng.log and .claude/ local artifacts | Hygiene |
| e7bab3d | feat: editable setup, items catalog, income-tax brackets, MC historical modes | Major feature |
| f28455d | feat: medicine pricing per location + SS in Monte Carlo | Feature |
| 2ef1dc1 | feat(a11y): add per-page help drawer with glossary + see-also links | A11y |
| b3f2a03 | feat(a11y): add dyslexia support + dyscalculia audit fixes across dashboard | A11y major |
| 038da85 | feat: add Fees & Currency screen with brokerage, transfer, and FX fees | Feature |

The 11 commits without the trailer are mostly the initial scaffold (`fd8b4ec`), PR merge commits (4x `Merge pull request`), and a handful of smaller polish commits (`eff72e3`, `6c8d2e4`, etc.). Inconsistent trailer usage is the single clearest transparency gap — trivial to fix.
