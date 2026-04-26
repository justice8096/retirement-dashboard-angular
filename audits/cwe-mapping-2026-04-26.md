# CWE Mapping & Compliance Cross-Walk — retirement-dashboard-angular

| Field | Value |
|---|---|
| **Date** | 2026-04-26 |
| **Commit** | `a547273` (main) |
| **Source audit** | `sast-dast-scan-2026-04-26.md` |
| **Findings in scope** | 2 LOW (carried forward, same CWE), 4 INFO (positive controls; +1 new INFO from LTC sampling) |
| **Previous mapping** | `cwe-mapping-2026-04-24.md` |

---

## Summary

This audit period (9 PRs since 2026-04-24) introduced **zero new CWEs**. The 2 active LOW findings are the same CWE-502 localStorage-parse pattern in `dyslexia.service.ts` and `dyscalculia.service.ts` carried forward from the 2026-04-19 baseline. Both are constrained to the user's own browser, defensively wrapped in try/catch with safe fallbacks, and would be closed together by the prior recommendation to introduce a shared schema validator.

No finding in this audit triggers a regulated incident-reporting threshold in any of the eight frameworks.

---

## Per-finding mapping (active CWEs)

### CWE-502 — Deserialization of Untrusted Data

| Field | Value |
|---|---|
| **Findings** | L-2026-04-19-01 (`dyslexia.service.ts:86–89`), L-2026-04-19-02 (`dyscalculia.service.ts:308–311`) |
| **CWE** | [CWE-502](https://cwe.mitre.org/data/definitions/502.html) |
| **OWASP Top 10 2021** | A08:2021 Software and Data Integrity Failures |
| **OWASP LLM Top 10 2025** | LLM03: Training Data Poisoning (analogous: cached client state could in theory be poisoned by extension or shared profile) |
| **NIST SP 800-53 Rev. 5** | SI-10 Information Input Validation; SC-8 Transmission Confidentiality and Integrity (cached state at rest in browser) |
| **EU AI Act Art. 25** | N/A (not AI-facing) |
| **ISO/IEC 27001:2022** | A.8.28 Secure coding |
| **SOC 2 TSC** | CC8.1 Change Management; PI1.1 Processing Integrity |
| **MITRE ATT&CK** | T1539 Steal Web Session Cookie (theoretical, requires local-machine compromise) |
| **MITRE ATLAS** | N/A |

**Status:** unchanged. Same call-sites, same defense-in-depth (try/catch + default fallback), same recommended fix (shared schema validator). No regression.

---

## Carried-forward CWEs (closed prior, no regression)

The following CWEs from prior audits remain closed in this batch:

| CWE | Closed in | Re-verified this audit |
|---|---|---|
| CWE-79 (XSS via raw HTML/SVG sinks) | 2026-04-19 (text-escape.ts shared lib) | YES — `grep` confirms no new innerHTML / sanitizer-bypass / DomSanitizer escapes |
| CWE-94 (code-execution sinks) | 2026-04-19 (zero eval / function-constructor / string-bodied timers in src) | YES — confirmed via batch diff sweep |
| CWE-1022 (insecure `window.open` without `noopener`) | 2026-04-19 (all `window.open` audited) | YES — only one `window.open` site (MC print export); `noopener,noreferrer` preserved |
| CWE-330 (insufficient randomness for security purposes) | 2026-04-19 (`Math.random` is statistical-only; UUIDs use `crypto.randomUUID`) | YES — 2 new `Math.random` sites this batch are LTC sampling (statistical-only, in-band) |
| CWE-798 (hardcoded credentials in source) | 2026-04-19 (no secrets in `src/environments/*`) | YES — confirmed via batch diff sweep |

---

## Compliance posture by framework (snapshot)

| Framework | Status | Notes |
|---|---|---|
| OWASP Top 10 2021 | A08 partial-mitigation (defensive fallbacks present); rest GREEN | Single CWE-502 finding mitigated by try/catch + defaults |
| OWASP LLM Top 10 2025 | N/A | App is not an LLM surface; no model integration |
| NIST SP 800-53 Rev. 5 | SI-10 partial; SA-11 covered by CodeQL+manual SAST in CI | |
| EU AI Act Art. 25 | N/A | Not in EU AI Act scope (no AI system serving users) |
| ISO/IEC 27001:2022 | A.8.28 partial (defensive); A.8.29 covered by CI security gates | |
| SOC 2 TSC 2017 | CC8.1 PASS (CI gates + provenance attestation); PI1.1 partial | |
| MITRE ATT&CK | No active TTPs raised | Theoretical T1539 requires local-machine compromise |
| MITRE ATLAS | N/A | |

---

## Verdict

**Posture unchanged from 2026-04-24.** No new CWEs, no regressions, no new incident-reporting thresholds met. The single open CWE (CWE-502 at 2 sites) remains a hardening opportunity, not an exposure.
