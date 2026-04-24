# CWE Mapping & Compliance Framework Crosswalk

**Date:** 2026-04-24
**Commit:** `4f6f307` (main)
**Source findings:** `audits/sast-dast-scan-2026-04-24.md`
**Frameworks mapped:** OWASP Top 10 2021, OWASP LLM Top 10 2025, NIST SP 800-53 Rev. 5, EU AI Act Art. 25, ISO/IEC 27001:2022, SOC 2 (Trust Services Criteria 2017, rev. 2022), MITRE ATT&CK Enterprise, MITRE ATLAS.

---

## Per-Finding CWE + Framework Mapping

### L-01 — localStorage JSON parsed without schema validation (dyslexia settings)

| Field | Value |
|---|---|
| **CWE ID** | CWE-502 |
| **CWE Title** | Deserialization of Untrusted Data |
| **Related CWEs** | CWE-20 (Improper Input Validation), CWE-1287 (Improper Validation of Specified Type of Input) |
| **Severity** | LOW |
| **Affected files** | `src/app/services/dyslexia.service.ts:86-89` |
| **OWASP Top 10 2021** | A08:2021 — Software and Data Integrity Failures; partial A03:2021 — Injection (validation-adjacent) |
| **OWASP LLM Top 10 2025** | N/A (no LLM surface in this component) |
| **NIST SP 800-53 Rev. 5** | SI-10 (Information Input Validation); SI-15 (Information Output Filtering, upstream analogue); SC-8 (Transmission Confidentiality & Integrity, client-side state) |
| **EU AI Act Art. 25** | N/A (not an AI-system obligation) |
| **ISO/IEC 27001:2022** | A.8.28 (Secure Coding); A.8.26 (Application Security Requirements) |
| **SOC 2 TSC** | CC7.1 (Detection of Security Events — input validation); CC8.1 (Change Management) |
| **MITRE ATT&CK** | T1565.001 (Stored Data Manipulation) — theoretical prerequisite, requires separate XSS foothold |
| **MITRE ATLAS** | N/A |

### L-02 — localStorage JSON parsed without schema validation (dyscalculia settings)

| Field | Value |
|---|---|
| **CWE ID** | CWE-502 |
| **CWE Title** | Deserialization of Untrusted Data |
| **Related CWEs** | CWE-20, CWE-1287 |
| **Severity** | LOW |
| **Affected files** | `src/app/services/dyscalculia.service.ts:308-311` |
| **OWASP Top 10 2021** | A08:2021 — Software and Data Integrity Failures |
| **OWASP LLM Top 10 2025** | N/A |
| **NIST SP 800-53 Rev. 5** | SI-10, SC-8 |
| **EU AI Act Art. 25** | N/A |
| **ISO/IEC 27001:2022** | A.8.28; A.8.26 |
| **SOC 2 TSC** | CC7.1; CC8.1 |
| **MITRE ATT&CK** | T1565.001 |
| **MITRE ATLAS** | N/A |

### I-01 — `Math.random()` in Monte Carlo sampling (NOT a vulnerability)

| Field | Value |
|---|---|
| **CWE ID** | CWE-338 — would apply if security-relevant |
| **CWE Title** | Use of Cryptographically Weak Pseudo-Random Number Generator |
| **Severity** | INFO (not exploitable; statistical sampling only) |
| **Affected files** | `src/app/lib/monte-carlo.ts:354-355, 378-380`; `src/app/data/historical-returns.ts:167` |
| **OWASP Top 10 2021** | A02:2021 — Cryptographic Failures (would apply if gating a security decision) |
| **OWASP LLM Top 10 2025** | N/A |
| **NIST SP 800-53 Rev. 5** | SC-13 (Cryptographic Protection) — inapplicable here |
| **EU AI Act Art. 25** | N/A |
| **ISO/IEC 27001:2022** | A.8.24 (Use of Cryptography) — inapplicable |
| **SOC 2 TSC** | CC6.1 (Logical Access) — inapplicable |
| **MITRE ATT&CK** | N/A |
| **MITRE ATLAS** | N/A |

### I-02 — HTML/SVG string interpolation with consistent XML-entity escaper

| Field | Value |
|---|---|
| **CWE ID** | CWE-79 (mitigated) / CWE-116 (mitigated) |
| **CWE Title** | Improper Neutralization of Input During Web Page Generation ('Cross-site Scripting') / Improper Encoding or Escaping of Output |
| **Severity** | INFO (mitigation in place, unit-tested) |
| **Affected files** | `src/app/lib/text-escape.ts:18-22`; `src/app/components/screens/brochure-screen/brochure-screen.component.ts:128-129`; `src/app/components/screens/montecarlo-screen/montecarlo-screen.component.ts:1851-1853` |
| **OWASP Top 10 2021** | A03:2021 — Injection (mitigated) |
| **OWASP LLM Top 10 2025** | LLM02:2025 — Sensitive Information Disclosure (indirectly — XSS could exfiltrate); mitigated |
| **NIST SP 800-53 Rev. 5** | SI-10 (Information Input Validation); SC-18 (Mobile Code) |
| **EU AI Act Art. 25** | N/A |
| **ISO/IEC 27001:2022** | A.8.28 (Secure Coding) |
| **SOC 2 TSC** | CC7.1; CC8.1 |
| **MITRE ATT&CK** | T1059.007 (JavaScript) — mitigated |
| **MITRE ATLAS** | N/A |

### I-03 — `window.open()` with `noopener,noreferrer`

| Field | Value |
|---|---|
| **CWE ID** | CWE-1022 (mitigated) |
| **CWE Title** | Use of Web Link to Untrusted Target with `window.opener` Access |
| **Severity** | INFO (mitigation in place) |
| **Affected files** | `src/app/components/screens/brochure-screen/brochure-screen.component.ts:186`; `src/app/components/screens/montecarlo-screen/montecarlo-screen.component.ts:1817` |
| **OWASP Top 10 2021** | A05:2021 — Security Misconfiguration (mitigated) |
| **NIST SP 800-53 Rev. 5** | SC-7 (Boundary Protection); SI-10 |
| **EU AI Act Art. 25** | N/A |
| **ISO/IEC 27001:2022** | A.8.28 |
| **SOC 2 TSC** | CC6.6 (Logical Access — Boundaries) |
| **MITRE ATT&CK** | T1189 (Drive-by Compromise) — mitigated |
| **MITRE ATLAS** | N/A |

### I-04 — No secrets in environment files

| Field | Value |
|---|---|
| **CWE ID** | CWE-798 (verified absent) |
| **CWE Title** | Use of Hard-coded Credentials |
| **Severity** | INFO (clean) |
| **Affected files** | `src/environments/environment.ts`; `src/environments/environment.prod.ts` (both clean) |
| **OWASP Top 10 2021** | A07:2021 — Identification and Authentication Failures (clean) |
| **NIST SP 800-53 Rev. 5** | IA-5 (Authenticator Management); SC-12 (Cryptographic Key Establishment) |
| **EU AI Act Art. 25** | N/A |
| **ISO/IEC 27001:2022** | A.5.17 (Authentication Information); A.8.24 |
| **SOC 2 TSC** | CC6.1 (Logical Access) |
| **MITRE ATT&CK** | T1552.001 (Credentials in Files) — no finding |
| **MITRE ATLAS** | N/A |

---

## Aggregate Matrix — Frameworks × Severity × Count

| Framework | CRITICAL | HIGH | MEDIUM | LOW | INFO | TOTAL |
|---|---|---|---|---|---|---|
| **OWASP Top 10 2021** — A02 Cryptographic Failures | 0 | 0 | 0 | 0 | 1 | 1 |
| **OWASP Top 10 2021** — A03 Injection (mitigated) | 0 | 0 | 0 | 0 | 1 | 1 |
| **OWASP Top 10 2021** — A05 Security Misconfiguration (mitigated) | 0 | 0 | 0 | 0 | 1 | 1 |
| **OWASP Top 10 2021** — A07 Auth Failures (clean) | 0 | 0 | 0 | 0 | 1 | 1 |
| **OWASP Top 10 2021** — A08 Data Integrity Failures | 0 | 0 | 0 | 2 | 0 | 2 |
| **OWASP LLM Top 10 2025** — LLM02 (indirect, mitigated) | 0 | 0 | 0 | 0 | 1 | 1 |
| **NIST SP 800-53** — SI-10 Input Validation | 0 | 0 | 0 | 2 | 2 | 4 |
| **NIST SP 800-53** — SC-7 Boundary Protection | 0 | 0 | 0 | 0 | 1 | 1 |
| **NIST SP 800-53** — SC-8 Transmission Integrity | 0 | 0 | 0 | 2 | 0 | 2 |
| **NIST SP 800-53** — SC-13 Cryptographic Protection | 0 | 0 | 0 | 0 | 1 | 1 |
| **NIST SP 800-53** — SC-18 Mobile Code | 0 | 0 | 0 | 0 | 1 | 1 |
| **NIST SP 800-53** — IA-5 Authenticator Management | 0 | 0 | 0 | 0 | 1 | 1 |
| **NIST SP 800-53** — SC-12 Key Establishment | 0 | 0 | 0 | 0 | 1 | 1 |
| **EU AI Act Art. 25** | 0 | 0 | 0 | 0 | 0 | 0 |
| **ISO/IEC 27001:2022** — A.8.28 Secure Coding | 0 | 0 | 0 | 2 | 2 | 4 |
| **ISO/IEC 27001:2022** — A.8.26 App Security Requirements | 0 | 0 | 0 | 2 | 0 | 2 |
| **ISO/IEC 27001:2022** — A.5.17 / A.8.24 Auth / Crypto | 0 | 0 | 0 | 0 | 2 | 2 |
| **SOC 2 TSC** — CC6.1 Logical Access | 0 | 0 | 0 | 0 | 1 | 1 |
| **SOC 2 TSC** — CC6.6 Logical Access Boundaries | 0 | 0 | 0 | 0 | 1 | 1 |
| **SOC 2 TSC** — CC7.1 Detection of Security Events | 0 | 0 | 0 | 2 | 1 | 3 |
| **SOC 2 TSC** — CC8.1 Change Management | 0 | 0 | 0 | 2 | 1 | 3 |
| **MITRE ATT&CK** — T1565.001 Stored Data Manipulation | 0 | 0 | 0 | 2 | 0 | 2 |
| **MITRE ATT&CK** — T1059.007 JavaScript (mitigated) | 0 | 0 | 0 | 0 | 1 | 1 |
| **MITRE ATT&CK** — T1189 Drive-by (mitigated) | 0 | 0 | 0 | 0 | 1 | 1 |
| **MITRE ATT&CK** — T1552.001 Credentials in Files (clean) | 0 | 0 | 0 | 0 | 1 | 1 |
| **MITRE ATLAS** | 0 | 0 | 0 | 0 | 0 | 0 |

### Roll-up by severity

| Severity | Count |
|---|---|
| CRITICAL | 0 |
| HIGH | 0 |
| MEDIUM | 0 |
| LOW | 2 |
| INFO | 4 |
| **Total findings** | **6** |

### Framework-family coverage

| Framework family | Findings mapped | Notes |
|---|---|---|
| OWASP Top 10 2021 | 2 LOW + 4 INFO | Each LOW maps to A08 |
| OWASP LLM Top 10 2025 | 1 INFO | XSS escaper → LLM02 (indirect) |
| NIST SP 800-53 Rev. 5 | 2 LOW + 4 INFO | SI-10 is the dominant control |
| EU AI Act Art. 25 | 0 | No AI-system obligations triggered — this is a deterministic dashboard |
| ISO/IEC 27001:2022 | 2 LOW + 4 INFO | A.8.28 Secure Coding dominant |
| SOC 2 TSC | 2 LOW + 4 INFO | CC7.1 + CC8.1 dominant |
| MITRE ATT&CK | 2 LOW + 3 INFO | T1565.001 is only-if-XSS-elsewhere |
| MITRE ATLAS | 0 | Out of scope — no ML model in this repo |

---

## Interpretation

- **No residual risk at CRITICAL/HIGH/MEDIUM** — nothing triggers an immediate compliance obligation under any of the eight frameworks.
- **Two LOW findings, both CWE-502** — same root cause (unchecked JSON.parse cast) in two parallel accessibility services. A single shared helper + validator closes both. Minimal compliance impact: they are already covered by a `try/catch` with safe fallback defaults, so SOC 2 CC7.1's "detection" criterion is partially met; the improvement would be to meet CC8.1's "validate changes to inputs" more fully.
- **EU AI Act Art. 25 returns zero findings** because this dashboard is a deterministic financial calculator, not an AI system. The classification dodges the obligation by design.
- **MITRE ATLAS returns zero findings** for the same reason — no ML model, no adversarial-ML surface.
