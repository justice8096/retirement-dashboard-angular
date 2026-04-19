# LLM Compliance & Transparency Report
## retirement-dashboard-angular

**Report Date**: 2026-04-19
**Auditor**: LLM Governance & Compliance (automated, Claude-assisted)
**Project**: retirement-dashboard-angular (Claude-assisted development)
**Framework**: EU AI Act Art. 25 & 52, OWASP LLM Top 10 2025, NIST SP 800-218A, ISO 27001:2022, SOC 2 TSC
**Audit Type**: INITIAL (no prior full audit — the two 2026-04-16 audits in `audits/` covered dyslexia & dyscalculia a11y only, not LLM governance)
**Commit**: 86e7fd7 on `feature/aca-cliff-tax-service-refactor`

---

## Executive Summary

**Overall LLM Compliance Score: 63 / 100** — **DEVELOPING** (50–69 band)

This is a privately developed consumer financial-planning SPA. The codebase itself contains no AI at runtime — Claude is used only at development time. The compliance posture therefore has two independent question sets:

1. **Dev-time AI use** (was the human–AI collaboration disclosed, attributed, reviewed?) → score-driving
2. **Runtime AI exposure** (does the app embed any LLM calls? does it expose users to model output?) → N/A (no runtime LLM — all advice text is hand-written by the developer)

The overall score is pulled down primarily by the absence of:
- A `README.md` disclosing AI-assisted development
- Per-file or per-commit attribution (commit messages do say `Co-Authored-By: Claude Opus 4.7` in some — 9 of 20 commits — but not all; no systematic tag)
- Any form of SBOM, CI, or formal change review

The score is boosted by:
- Strong defensive coding (0 critical/high findings in the SAST scan)
- Clean supply chain at runtime (only dev-deps have CVEs)
- Angular's default-safe template engine (no `bypassSecurityTrust` usage)
- Thoughtful accessibility work (dyslexia + dyscalculia services) that demonstrates human-guided design judgement

---

## 8 Compliance Dimensions

### Dimension 1: System Transparency — **55 / 100**

**Assessment:**
- Is AI use disclosed to end users? **No.** No README, no in-app "about" / credits, no link to project source.
- Is AI use disclosed in the repo? **Partially.** 9 of 20 commits contain a `Co-Authored-By: Claude Opus 4.7` trailer; recent commit `d55c22f` and `86e7fd7` include extensive multi-paragraph commit bodies that describe the AI–human collaboration in detail. The other 11 commits do not carry the trailer.
- Are AI-generated components identifiable at the file level? **No.** No `@generated` markers, no `// AI-assisted` headers.
- Is there a human oversight mechanism? **Yes, informally.** All commits are authored by `justice8096@gmail.com` and pushed via manual PR (#6 active). Claude operates in an approval-gated workflow per the `.claude/` local settings.

**Regulatory mapping:** EU AI Act Art. 52 (Transparency), NIST AI RMF MAP 1.1, ISO 27001 A.8.9.

**Score rationale:** Commit-trailer disclosure exists but is inconsistent; no README disclosure; no end-user disclosure. This is typical for a solo pre-release project and acceptable for now, but sub-70 until a README exists.

**To reach 80:** Add a README section "Development" that names Claude as an assistant, links to this audit folder, and states "every commit is human-reviewed before push." Add `Co-Authored-By: Claude Opus 4.7` trailer to all commits going forward (configure `.gitmessage` template).

---

### Dimension 2: Training Data Disclosure — **60 / 100**

**Assessment:**
- Framework sources documented? **Yes, implicitly.** The a11y audits from 2026-04-16 cite IDA KPS 2018, IDEA, WCAG 2.2, Dyslexia UX Heuristics, and list specific standards. CWE / OWASP references appear in this audit suite.
- Model version and provider? **Documented only through commit trailers** ("Claude Opus 4.7"). No `MODELS.md` or similar.
- Training data disclosure? **Not applicable** — no fine-tuning, no RAG, no model training in the project. The project consumes Claude as a SaaS assistant.

**Regulatory mapping:** EU AI Act Art. 53 (Technical documentation), NIST AI RMF MEASURE 2.6.

**Score rationale:** The relevant "training data" question reduces to "what knowledge base did the developer work from?" The audits cite specific standards; however, there is no central `references.md` and no pinned model version at the project level.

**To reach 80:** Add a short `docs/AI-USE.md` that pins model version (Claude Opus 4.7 as of 2026-04), lists the knowledge areas Claude supplied (Angular idioms, actuarial / tax / ACA formulas), and the knowledge areas Claude was told about (user's own regime preferences — see MEMORY.md: `aca-subsidy-regime.md` — ACA enhanced-only decision; `prisma-string-fields.md` — Decimal handling rule).

---

### Dimension 3: Risk Classification — **75 / 100**

**Assessment:**
- Accurate CWE mappings? **Yes.** This audit set maps each finding to CWE IDs that match the CWE 4.x definitions. The dev-dep CVEs are cited with GHSA IDs from the official advisory database.
- Severity consistent with industry standards? **Yes.** CVSS v3.1 vectors are supplied for medium findings; dev-dep CVEs use the npm-audit severity.
- False positives minimized? **Yes.** The brochure-screen HTML string interpolation was initially a candidate finding but was verified safe after manual inspection (all interpolations go through `esc()`). Included in the report as "verified safe, documented as defense-in-depth."
- Classification validated against a DB? **Yes**, via `npm audit --json` for deps and manual CWE lookup for app findings.

**Regulatory mapping:** EU AI Act Art. 25, NIST SP 800-53 RA-3, OWASP LLM Top 10 2025 LLM09.

**Score rationale:** Classification is disciplined and conservative. Sub-90 only because there is no automated SAST that can catch regressions — this audit is a single point-in-time snapshot.

**To reach 90:** Integrate a free tier of Semgrep or CodeQL in CI so the CWE mapping is continuously re-generated per PR.

---

### Dimension 4: Supply Chain Security — **55 / 100**

**Assessment:**
- Pipeline hardening? **Low** — no CI exists yet.
- Deps pinned? **Yes** via `package-lock.json`; `package.json` uses `^` carets (typical npm pattern).
- CI/CD secrets handling? **N/A** — no CI.
- SBOM? **No.** Not emitted by `@angular/build` by default and not added manually.
- Signed commits? **No.** Commits are unsigned (git log `%G?` = `N`).

**Regulatory mapping:** NIST SP 800-218A, SLSA v1.0, EU AI Act Art. 25, ISO 27001 A.15.

**Score rationale:** Clean runtime supply chain balanced against absent CI, SBOM, and signing. 3 HIGH-severity dev-dep CVEs documented and accepted until next major upgrade.

**To reach 75:** Add GitHub Actions with `npm ci && npm audit --audit-level=high && npm run build`. Emit CycloneDX SBOM as build artifact. This alone gets the project to SLSA L1.

---

### Dimension 5: Consent & Authorization — **85 / 100**

**Assessment:**
- User control of AI tool? **Full.** Developer invokes Claude manually; no auto-commit, no auto-push. The `.claude/settings` in repo is gitignored (see commit `37e6ebb`) but local config requires explicit skill / command invocation.
- Opt-in? **Yes** — Claude Code is explicitly installed and invoked per-session.
- Destructive actions gated? **Yes** — per the Claude Code harness defaults, destructive git ops (force-push, reset --hard) require explicit user authorization.
- User can override AI recommendations? **Yes, unconditionally.** All audit reports and code suggestions are editable artifacts; nothing auto-executes.

**Regulatory mapping:** EU AI Act Art. 14 (Human oversight), NIST AI RMF GOVERN 1.2, SOC 2 CC6.1.

**Score rationale:** High — the collaboration model is strong on human oversight. Sub-90 only because there is no formal audit-log of "what did Claude propose" vs "what did Justice accept" at a line level.

**To reach 95:** Keep a lightweight `CHANGELOG.md` that attributes each feature to a PR/commit hash, noting "AI-drafted, human-reviewed" vs "human-authored, AI-reviewed."

---

### Dimension 6: Sensitive Data Handling — **70 / 100**

**Assessment:**
- Secrets / API keys protected? **Yes** — grep found zero hardcoded credentials or tokens in source. Environment URLs are configuration, not secrets.
- PII handled? **Low footprint.** The frontend collects retirement-planning inputs (household profile, target income, savings balances) which are moderately sensitive but already intended for backend storage under authenticated user.
- Scan results stored securely? **Yes** — audits are written to `audits/` in the repo (the user's explicit choice). The Obsidian vault reference in `MEMORY.md` is only for human session notes, not scan output.
- Tool avoids leaking sensitive data in reports? **Yes** — no real user data appears in audit outputs.
- `localStorage` contents? **Only a11y preferences** (font size, read-aloud rate, contrast mode) — no PII, no tokens, no financials. Confirmed by reading both `dyslexia.service.ts` and `dyscalculia.service.ts`.

**Regulatory mapping:** GDPR Art. 5, NIST SP 800-53 SC-28, ISO 27001 A.8.11, SOC 2 CC6.7.

**Score rationale:** Good baseline; sub-80 because:
- Finding L-04 (no runtime response-shape validation) means a backend leak could propagate to browser console without the frontend catching it.
- Finding I-03 (`console.warn` on errors in production) leaks endpoint shapes to the browser console.
- No explicit PII-masking layer in displayed data.

**To reach 85:** Strip `console.warn` in production builds, or route through an `environment.production ? noop : console.warn` gate.

---

### Dimension 7: Incident Response — **60 / 100**

**Assessment:**
- Vulnerability remediation procedures documented? **Partially** — this audit is the first such doc and includes remediation guidance per finding.
- Errors surface clearly? **Mixed.** Services generally `console.warn` on error and store an `error` signal that screens can read, but silent empty-catch patterns exist in `dyslexia.service.ts:72` and `dyscalculia.service.ts:205, 217` (all acceptable because they are non-critical a11y settings).
- Fix-then-reaudit workflow? **Not yet** — this is the first audit; the workflow is instantiated by running the full suite again post-remediation.
- Findings actionable? **Yes** — every finding has a specific remediation paragraph with effort estimate.

**Regulatory mapping:** NIST SP 800-53 IR-4, ISO 27001 A.16, SOC 2 CC7.3.

**Score rationale:** The architecture supports incident response, but the process is nascent. No `SECURITY.md`, no disclosure contact, no severity SLA.

**To reach 80:** Add `SECURITY.md` with disclosure contact and SLA; add a "known issues" section to the README linking back to this audit.

---

### Dimension 8: Bias Assessment — **50 / 100**

**Assessment:**
- FP/FN rates documented? **No.** This scan was manual-pattern-driven; it has no measured false-positive rate.
- Equitable language / framework coverage? **Single-stack project** — Angular 19 / TS only; doesn't need multi-stack coverage.
- Detection patterns validated? **Partially** — the regex patterns used here are standard, but not fed through a known test corpus.
- Detection gaps acknowledged? **Yes** — the SAST scan lists "DAST not performed" explicitly, and notes that backend security is out of scope.

**Regulatory mapping:** EU AI Act Art. 10, NIST AI RMF MEASURE 2.11, OWASP LLM Top 10 2025 LLM09.

**Score rationale:** The "bias" dimension maps awkwardly onto a static SPA (bias is usually an ML-model concept). Interpreted as "scan coverage honesty," the audit is honest about gaps (DAST, backend, tests) but has not quantified them. The **domain-logic bias** — retirement calculations — has not been assessed for fairness across user archetypes (e.g., does the MC simulation treat spouse-death modeling symmetrically across genders? — unaudited).

**To reach 75:** Run the app through a known benchmark (or simply document the model assumptions in a `docs/MODEL-ASSUMPTIONS.md`). Add a CONTRIBUTING / ETHICS note on retirement-math fairness.

---

## Score Summary

| Dimension | Score | Status |
|-----------|:-----:|--------|
| 1. System Transparency | 55 | DEVELOPING |
| 2. Training Data Disclosure | 60 | DEVELOPING |
| 3. Risk Classification | 75 | GOOD |
| 4. Supply Chain Security | 55 | DEVELOPING |
| 5. Consent & Authorization | 85 | GOOD |
| 6. Sensitive Data Handling | 70 | GOOD |
| 7. Incident Response | 60 | DEVELOPING |
| 8. Bias Assessment | 50 | DEVELOPING |
| **Overall (weighted average)** | **63.75 → 63** | **DEVELOPING** |

Weights applied: equal (1/8). If you weight Supply Chain and Transparency higher for regulated-context use, the score drops ~3 points; if you weight Consent and Risk Classification higher for a solo-dev project, it rises ~4 points.

---

## Recommendations (Ranked by Score Lift)

1. **Add `README.md` with AI disclosure** → Transparency +20, Training Data +10 → overall +4 points. Effort: 30 min.
2. **Add GitHub Actions CI with `npm audit` + SBOM** → Supply Chain +20, Incident Response +10 → overall +4 points. Effort: 45 min.
3. **Fix M-01 (reverse tabnabbing) and M-02 (CSP)** → Sensitive Data +5, Risk Classification +5 on re-audit → overall +1-2 points. Effort: 20 min.
4. **Add `SECURITY.md`** → Incident Response +15 → overall +2 points. Effort: 15 min.
5. **Add `docs/AI-USE.md` pinning model version + knowledge sources** → Training Data +20 → overall +2.5 points. Effort: 20 min.

All five together would push the overall score from 63 into the **GOOD (70–89) band** — estimated post-remediation score: **77**.

---

## Regulatory Roadmap

| Regulation | Applicable? | Current Status | Next Milestone |
|-----------|-------------|----------------|----------------|
| **EU AI Act** | Indirectly (dev-time AI use) | Partial disclosure | Add AI-use doc + consistent commit trailers by 2026-06 |
| **NIST SP 800-218A (SSDF)** | Yes (software development) | ~50% coverage | CI + SBOM + tests by 2026-07 |
| **ISO 27001:2022** | Aspirational | Informal | Stay informal — ISMS is out of scope for a solo project |
| **SOC 2 TSC** | Not applicable | — | Only relevant if this becomes a SaaS offering |
| **GDPR** | Contingent on user data | Depends on backend scope | Backend concern; frontend remains PII-light |
| **HIPAA** | Not applicable | — | App models healthcare spending in aggregate — not PHI |

---

## Next Audit Recommendation

**Next audit: on completion of the M-01 / M-02 fix cycle, or 30 days from now (2026-05-19), whichever is sooner.**

The next audit will be a re-audit with before/after deltas across all 8 dimensions and a focus on whether the remediations landed cleanly.
