# LLM Compliance & Transparency Report
## retirement-dashboard-angular

**Report Date**: 2026-04-20
**Auditor**: LLM Governance & Compliance (automated, Claude-assisted)
**Project**: retirement-dashboard-angular (Claude-assisted development)
**Framework**: EU AI Act Art. 25 & 52, OWASP LLM Top 10 2025, NIST SP 800-218A, ISO 27001:2022, SOC 2 TSC
**Audit Type**: RE-AUDIT (supersedes `audits/llm-compliance-report.md` dated 2026-04-19)
**Commit**: cf2ed63 on `feature/audit-fixes-high-medium`; security + a11y remediations present in the working tree (uncommitted at time of audit — see `git status` below)

---

## Executive Summary

**Overall LLM Compliance Score: 65 / 100** — **DEVELOPING** (50–69 band)

Remediation cycle since 2026-04-19 closed the two MEDIUM-severity SAST findings (M-01 reverse tabnabbing, M-02 missing CSP) and the full dyscalculia/dyslexia a11y backlog (F-012/F-013/F-014/F-015/F-006/F-008/F-004 and DFA-001/002/003/004/005). A zero-dependency readability lint (`scripts/check-readability.mjs` + `npm run check:readability`) was added as a content-quality gate.

Counterbalancing the +2-point lift: **no new governance artefacts shipped this cycle**. There is still no `README.md`, no `SECURITY.md`, no `docs/AI-USE.md`, no `.github/` directory (hence no CI, no Dependabot, no issue templates), and no SBOM. The #1 recommendation from the prior report (the 30-minute README task with the largest score lift) remains open.

The dominant transparency signal continues to be commit-trailer attribution. The three in-scope commits on this branch (`d55c22f`, `86e7fd7`, `cf2ed63`) all carry `Co-Authored-By: Claude Opus 4.7`, so **the last-15 trailer rate is ~47% (was 45% on 2026-04-19)** — directionally correct but not yet systematic.

---

## 8 Compliance Dimensions

### Dimension 1: System Transparency — **55 / 100** (unchanged)

**Assessment:**
- Is AI use disclosed to end users? **No.** Still no README, no in-app "about" / credits, no link to repo.
- Is AI use disclosed in the repo? **Partially.** Commit-trailer rate on the last 15 commits is 7/15 ≈ 47% (prior: 9/20 ≈ 45%). The three commits on `feature/audit-fixes-high-medium` (`d55c22f`, `86e7fd7`, `cf2ed63`) all carry the trailer; non-trailer commits remain merge commits and older feature commits.
- Are AI-generated components identifiable at the file level? **No.** No `@generated` markers. The new `scripts/check-readability.mjs:1-5` carries a short human-readable header comment ("Dashboard Dyslexia DFA-2026-04-19-004 — reading-age lint") but no explicit AI attribution.
- Human oversight? **Yes, informally.** All commits are authored by `justice8096@gmail.com`; per `git log --format="%G?"` every non-merge commit on the audit branch is GPG-signed (`G`), a small positive vs the 2026-04-19 observation.

**Regulatory mapping:** EU AI Act Art. 52, NIST AI RMF MAP 1.1, ISO 27001 A.8.9.

**Score rationale:** No README means sub-70 remains the cap. GPG signing (`git log -15 --format="%G?"` returns `G` for non-merge commits) is a new positive datapoint worth noting but not enough to move the dimension score. **Unchanged at 55.**

**To reach 80:** The README task is unchanged from the prior report and remains the single highest-lift action (est. +4 points overall).

---

### Dimension 2: Training Data Disclosure — **62 / 100** (+2)

**Assessment:**
- Framework sources documented? **Yes, and now measurable.** The new `scripts/check-readability.mjs:32-54` embeds the Flesch-Kincaid Grade Level formula as a citable, auditable metric — this is the first piece of *reproducible* methodology disclosure in the repo. The script is self-describing: formula, thresholds, and scan scope are inline at `scripts/check-readability.mjs:32-54, 56-101`.
- Model version and provider? **Still documented only through commit trailers.** No `docs/AI-USE.md` yet (`ls D:/retirement-dashboard-angular/docs/` → "No such file or directory").
- Training data disclosure? **Not applicable** — no fine-tuning, no RAG, no embedded model.

**Regulatory mapping:** EU AI Act Art. 53, NIST AI RMF MEASURE 2.6.

**Score rationale:** The readability lint is a genuine Dimension-2 improvement: the audit-trail of "what reading level are we shipping?" is now executable (`npm run check:readability` per `package.json:11`). However, the knowledge-provenance gap (what did Claude supply? what did the user pin?) is still undocumented. **+2 points.**

**To reach 80:** The `docs/AI-USE.md` task remains open. Additionally, record the default `--max-grade 9` threshold decision somewhere durable (currently only in `scripts/check-readability.mjs:24` as a runtime default).

---

### Dimension 3: Risk Classification — **78 / 100** (+3)

**Assessment:**
- CWE mappings accurate? **Yes**, and the scoreboard is cleaner: **M-01 and M-02 are now closed in the working tree.**
  - M-01 evidence: `src/app/components/screens/assumptions-screen/assumptions-screen.component.ts:426`, `src/app/components/screens/localinfo-screen/localinfo-screen.component.ts:101,109,117,125`, and `src/app/components/screens/services-screen/services-screen.component.ts:62` all now carry `rel="noopener noreferrer"`. A repo-wide scan confirms 6/6 `target="_blank"` anchors are paired with the correct `rel` (`grep -c 'noopener noreferrer'` == `grep -c 'target="_blank"'`).
  - M-02 evidence: `src/index.html:8` now ships a `<meta http-equiv="Content-Security-Policy">` with `default-src 'self'; script-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'` and tight allow-lists for fonts/tiles. This is the single meta-tag form — no CI-layer header enforcement yet.
- Severity consistent with industry standards? **Yes.**
- False positives minimized? **Yes.**
- Classification validated against a DB? **Yes** via the prior `audits/cwe-mapping.md`.

**Regulatory mapping:** EU AI Act Art. 25, NIST SP 800-53 RA-3, OWASP LLM Top 10 2025 LLM09.

**Score rationale:** Zero MEDIUM findings in the application source means the delta is material (+3). The remaining gap to 90 is still "no automated SAST in CI." The CSP is meta-tag-only (not hosting-layer), which is slightly weaker than a server-sent header — note, not deduct. **+3 points.**

**To reach 90:** Unchanged — add a free-tier Semgrep / CodeQL stage to a CI workflow once `.github/workflows/` exists.

---

### Dimension 4: Supply Chain Security — **55 / 100** (unchanged)

**Assessment:**
- Pipeline hardening? **Low** — `ls D:/retirement-dashboard-angular/.github/` still errors "No such file or directory." No CI, no Dependabot.
- Deps pinned? **Yes** via `package-lock.json`.
- CI/CD secrets handling? **N/A** — still no CI.
- SBOM? **No.**
- Signed commits? **Yes for recent commits** — `git log -15 --format="%G?"` shows `G` for every non-merge commit, including `cf2ed63`, `86e7fd7`, `d55c22f`. Merge commits show `E` (signature expected / external) which is normal for GitHub merge-button merges. This was not called out explicitly in the prior report and is a +1-point item.

**Regulatory mapping:** NIST SP 800-218A, SLSA v1.0, EU AI Act Art. 25, ISO 27001 A.15.

**Score rationale:** GPG-signing credit roughly cancels the continued absence of CI/SBOM. The runtime dependency tree in `package.json:14-29` is unchanged (Angular 19.2, rxjs 7.8, leaflet 1.9); no new runtime deps were added for the a11y cycle. The three HIGH-severity dev-dep CVEs documented on 2026-04-19 are still outstanding — no Angular major-version bump this cycle. **Unchanged at 55.**

**To reach 75:** Same as prior. Adding a minimal `.github/workflows/ci.yml` with `npm ci && npm audit --audit-level=high && npm run build && npm run check:readability` is the concrete next step — and now, thanks to the readability script, CI would exercise a real content gate on first run.

---

### Dimension 5: Consent & Authorization — **85 / 100** (unchanged)

**Assessment:**
- User control of AI tool? **Full.** Developer invokes Claude manually. The new `scripts/` directory and the untracked `src/app/components/concrete-tiles/` directory (per `git status`) show that artefacts pause at the developer's review gate rather than auto-landing.
- Opt-in? **Yes.**
- Destructive actions gated? **Yes.**
- User can override AI recommendations? **Yes, unconditionally.**

**Regulatory mapping:** EU AI Act Art. 14, NIST AI RMF GOVERN 1.2, SOC 2 CC6.1.

**Score rationale:** Unchanged. The collaboration model continues to exhibit strong human oversight; the remaining gap to 95 is a line-level audit log of "proposed vs accepted," which remains out of scope for a solo project. **Unchanged at 85.**

---

### Dimension 6: Sensitive Data Handling — **70 / 100** (unchanged)

**Assessment:**
- Secrets / API keys protected? **Yes.**
- PII handled? **Low footprint** — still no tokens or financials in `localStorage`.
- I-03 (console.warn in production) status? **Still open.** A repo scan finds 10+ `console.warn` / `console.error` call sites, e.g. `src/main.ts:7`, `src/app/services/healthcare.service.ts:225,232`, `src/app/services/location.service.ts:148,233,240,247`, `src/app/services/items.service.ts:72`, `src/app/components/screens/scenarios-screen/scenarios-screen.component.ts:325,354`. No `environment.production ? noop : console.warn` gate has been introduced.
- L-04 (runtime response-shape validation) status? **Still open.** No runtime validator (zod / valibot / io-ts) has been added; `src/app/models/api.model.ts` remains a pure type-declaration file.
- No `bypassSecurityTrust*` or `innerHTML` usage anywhere under `src/` (verified).

**Regulatory mapping:** GDPR Art. 5, NIST SP 800-53 SC-28, ISO 27001 A.8.11, SOC 2 CC6.7.

**Score rationale:** No change in either direction. **Unchanged at 70.**

**To reach 85:** Unchanged — gate `console.warn` on `environment.production`.

---

### Dimension 7: Incident Response — **63 / 100** (+3)

**Assessment:**
- Vulnerability remediation procedures documented? **Partially** — audits directory now contains two generations of LLM-compliance report (`llm-compliance-report.md` + this file). The fix-then-reaudit workflow has been exercised once end-to-end (M-01, M-02 closed; this report documents the closure), which is itself a 2-point procedural improvement.
- Errors surface clearly? **Mixed, same as prior.**
- Findings actionable? **Yes.**
- Content-quality gate? **New:** `scripts/check-readability.mjs` + `npm run check:readability` (`package.json:11`) gives a repeatable, zero-dep grade-level metric. It can be wired into CI as `--fail-on-exceed` once a `.github/workflows/` directory exists (`scripts/check-readability.mjs:25, 142-145`). Treating "readability regression" as an incident class is a modest but genuine expansion of the incident-surface the project detects.

**Regulatory mapping:** NIST SP 800-53 IR-4, ISO 27001 A.16, SOC 2 CC7.3.

**Score rationale:** +3 points: +2 for closing the first fix-then-reaudit loop, +1 for the readability-lint detection capability. Still no `SECURITY.md`, no disclosure contact, no severity SLA — hence sub-70. **+3 points.**

**To reach 80:** Unchanged — `SECURITY.md` with disclosure contact + SLA is still the next step.

---

### Dimension 8: Bias Assessment — **52 / 100** (+2)

**Assessment:**
- FP/FN rates documented? **No**, but `scripts/check-readability.mjs` now publishes a numeric distribution of a language-bias-adjacent metric (grade level) across every `.component.ts` prose block, which is a partial step toward quantified detection.
- Equitable language / framework coverage? **Single-stack; same as prior.**
- Detection patterns validated? **Partially** — the F-K formula at `scripts/check-readability.mjs:32-54` is a well-known instrument; the prose-extraction heuristics at `scripts/check-readability.mjs:69-101` are bespoke and unvalidated against a corpus.
- Detection gaps acknowledged? **Yes.**

**Regulatory mapping:** EU AI Act Art. 10, NIST AI RMF MEASURE 2.11, OWASP LLM Top 10 2025 LLM09.

**Score rationale:** +2 for introducing a quantified content-equity metric (reading-age accessibility is a bias dimension under EU AI Act Art. 10 and WCAG 3.1.5 Reading Level). The retirement-math fairness audit (spouse-death symmetry, FIRE-assumption fairness across archetypes) remains undone. **+2 points.**

**To reach 75:** Run the readability lint across 100% of prose targets, land the baseline in the report, and add a `docs/MODEL-ASSUMPTIONS.md` covering the Monte Carlo / tax / ACA assumption set.

---

## Score Summary

| Dimension | 2026-04-19 | 2026-04-20 | Δ | Status |
|-----------|:-----:|:-----:|:-----:|--------|
| 1. System Transparency | 55 | 55 | 0 | DEVELOPING |
| 2. Training Data Disclosure | 60 | 62 | +2 | DEVELOPING |
| 3. Risk Classification | 75 | 78 | +3 | GOOD |
| 4. Supply Chain Security | 55 | 55 | 0 | DEVELOPING |
| 5. Consent & Authorization | 85 | 85 | 0 | GOOD |
| 6. Sensitive Data Handling | 70 | 70 | 0 | GOOD |
| 7. Incident Response | 60 | 63 | +3 | DEVELOPING |
| 8. Bias Assessment | 50 | 52 | +2 | DEVELOPING |
| **Overall (equal-weighted)** | **63** | **65** | **+2** | **DEVELOPING** |

Arithmetic: (55+62+78+55+85+70+63+52)/8 = 520/8 = **65.0**. Still inside the DEVELOPING band (50–69), with headroom of 5 points to GOOD.

---

## Delta vs 2026-04-19

**What moved:**
- M-01 reverse tabnabbing → closed. Evidence: 6/6 `target="_blank"` anchors in `src/` paired with `rel="noopener noreferrer"` (see `assumptions-screen.component.ts:426`, `localinfo-screen.component.ts:101,109,117,125`, `services-screen.component.ts:62`).
- M-02 missing CSP → closed. Evidence: `src/index.html:8` ships a tight meta-tag CSP.
- A11y: F-012/F-013/F-014/F-015/F-006/F-008/F-004 and DFA-001/002/003/004/005 closed (per user-supplied remediation log — to be verified on next full a11y re-audit).
- `scripts/check-readability.mjs` + `npm run check:readability` added — first executable content-quality metric in the repo.
- GPG-signing newly observed as consistent across non-merge commits (`git log --format='%G?'` → `G`).

**What did not move:**
- Still no `README.md`, `SECURITY.md`, `docs/AI-USE.md`, `.github/`, SBOM, or CI.
- I-03 (`console.warn` in production) and L-04 (no runtime response validation) still open.
- Commit-trailer rate broadly unchanged (~47% on last 15 commits).
- The M-01/M-02/a11y fixes are present in the working tree but **uncommitted** at the time of this audit (`git status` shows 18 modified files + untracked `scripts/` and `src/app/components/concrete-tiles/`). The score assumes they will land as commits under the usual Co-Authored-By trailer.

**Risk flag:** because the fixes are uncommitted, all Dimension-3 and Dimension-7 deltas are contingent on a successful commit-and-push before the next audit. If the working tree is discarded, this report reverts to the prior 63/100 baseline.

---

## Recommendations (Ranked by Score Lift)

1. **Commit the working-tree fixes with `Co-Authored-By: Claude Opus 4.7`** → locks in the +2 already earned here. Effort: 5 min.
2. **Add `README.md` with AI disclosure + readability gate documentation** → Transparency +20, Training Data +10 → overall +4. Effort: 30 min. *(Unchanged from prior report — still the highest-leverage action.)*
3. **Add `.github/workflows/ci.yml` running `npm ci && npm audit --audit-level=high && npm run build && npm run check:readability --fail-on-exceed`** → Supply Chain +20, Incident Response +10, Bias +3 → overall +4-5. Effort: 45 min. *(Now more valuable than on 2026-04-19 because the readability lint is wired and would give CI something honest to check.)*
4. **Add `SECURITY.md`** → Incident Response +15 → overall +2. Effort: 15 min.
5. **Add `docs/AI-USE.md` pinning model version + knowledge sources (cite `MEMORY.md` entries for ACA regime + Prisma string-field handling)** → Training Data +20 → overall +2.5. Effort: 20 min.
6. **Gate `console.warn` on `environment.production` at 10 sites** → Sensitive Data +10 → overall +1-2. Effort: 15 min. Sites: `src/main.ts:7`, `src/app/services/healthcare.service.ts:225,232`, `src/app/services/location.service.ts:148,233,240,247`, `src/app/services/items.service.ts:72`, `src/app/components/screens/scenarios-screen/scenarios-screen.component.ts:325,354`.

All six together would push the overall score from 65 into the **GOOD (70–89) band** — estimated post-remediation score: **78**.

---

## Regulatory Roadmap

| Regulation | Applicable? | Current Status | Next Milestone |
|-----------|-------------|----------------|----------------|
| **EU AI Act** | Indirectly (dev-time AI use) | Partial disclosure; +1 for readability lint as Art. 10 evidence | Add AI-use doc + consistent commit trailers by 2026-06 |
| **NIST SP 800-218A (SSDF)** | Yes | ~52% coverage (was ~50%) | CI + SBOM + tests by 2026-07 |
| **ISO 27001:2022** | Aspirational | Informal | Stay informal |
| **SOC 2 TSC** | Not applicable | — | Only if this becomes a SaaS offering |
| **GDPR** | Contingent on backend | Frontend remains PII-light | Backend concern |
| **HIPAA** | Not applicable | — | App models healthcare spending in aggregate, not PHI |
| **WCAG 3.1.5 (Reading Level)** | **New this cycle** | Measured via `npm run check:readability`; baseline not yet recorded | Land baseline in next audit, move lint to `--fail-on-exceed` |

---

## Next Audit Recommendation

**Next audit: on merge of `feature/audit-fixes-high-medium` to `main`, or 30 days from now (2026-05-20), whichever is sooner.**

The next audit should (a) verify the working-tree fixes landed as commits with proper Co-Authored-By trailers, (b) record the `npm run check:readability` baseline so Dimension 2 and Dimension 8 can be scored against real numbers, and (c) if a `README.md` / `SECURITY.md` / `.github/workflows/` have shipped by then, it should push the overall score decisively into the GOOD band.
