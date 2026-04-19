# CWE & Compliance Framework Mapping
## retirement-dashboard-angular

| Field | Value |
|-------|-------|
| **Project** | retirement-dashboard-angular |
| **Mapping Date** | 2026-04-19 |
| **Commit** | 86e7fd7 |
| **Branch** | feature/aca-cliff-tax-service-refactor |
| **Source Findings** | `sast-dast-scan.md` (6 app findings), `supply-chain-audit.md` (3 dev-dep CVEs) |
| **Frameworks Mapped** | OWASP Top 10 2021, OWASP LLM Top 10 2025, NIST SP 800-53 Rev.5, EU AI Act (Art. 10, 14, 25, 52, 53), ISO 27001:2022, SOC 2 TSC, MITRE ATT&CK, MITRE ATLAS |

---

## Findings → CWE

| ID | Severity | CWE(s) | Finding |
|----|----------|--------|---------|
| M-01 | Medium | CWE-1022 | Reverse tabnabbing: `target="_blank"` without `rel="noopener noreferrer"` on dynamic-href links |
| M-02 | Medium | CWE-693, CWE-1021 | No Content-Security-Policy configured |
| L-01 | Low | CWE-353 | No Subresource Integrity on CDN font CSS |
| L-02 | Low | CWE-400 | Unthrottled `localStorage.setItem` writes |
| L-03 | Low | CWE-601 | `window.open` of blob URL without `noopener` |
| L-04 | Low | CWE-20 | No runtime HTTP response-shape validation |
| DEP-1 | High | CWE-22, CWE-59, CWE-176, CWE-367 | `tar < 7.5.10` (6 chained CVEs) — dev-dep only |
| DEP-2 | High | CWE-22 (inherited) | `pacote` depends on vulnerable tar — dev-dep only |
| DEP-3 | High | CWE-22 (inherited) | `@angular/cli` depends on vulnerable pacote — dev-dep only |

---

## Per-CWE Mapping

### CWE-20 — Improper Input Validation

| Framework | Mapping |
|-----------|---------|
| OWASP Top 10 2021 | A03:2021 — Injection (adjacent) |
| OWASP LLM Top 10 2025 | LLM05 — Improper Output Handling (if AI-produced content flows into API responses) |
| NIST SP 800-53 Rev.5 | SI-10 (Information Input Validation), SI-15 (Information Output Filtering) |
| EU AI Act | Art. 15 (Accuracy, robustness, cybersecurity) |
| ISO 27001:2022 | A.8.26 (Application security requirements), A.8.28 (Secure coding) |
| SOC 2 | CC8.1 (Change management) |
| MITRE ATT&CK | T1190 (Exploit Public-Facing Application) — adjacent |
| MITRE ATLAS | AML.T0043 (Craft Adversarial Data) — adjacent |

### CWE-22 — Improper Limitation of a Pathname to a Restricted Directory (Path Traversal)

| Framework | Mapping |
|-----------|---------|
| OWASP Top 10 2021 | A01:2021 — Broken Access Control |
| OWASP LLM Top 10 2025 | N/A |
| NIST SP 800-53 Rev.5 | AC-3 (Access Enforcement), SI-10 |
| EU AI Act | Art. 25 (Supply chain — deps) |
| ISO 27001:2022 | A.8.2 (Privileged access), A.5.23 (Supplier cloud services) |
| SOC 2 | CC6.1 (Logical access) |
| MITRE ATT&CK | T1083 (File & Directory Discovery), T1552.001 (Unsecured Credentials: Files) |
| MITRE ATLAS | AML.T0036 (Data from Information Repositories) |

### CWE-59 — Improper Link Resolution Before File Access (Link Following)

| Framework | Mapping |
|-----------|---------|
| OWASP Top 10 2021 | A01:2021 — Broken Access Control |
| NIST SP 800-53 Rev.5 | AC-3, SI-10 |
| ISO 27001:2022 | A.8.28 |
| SOC 2 | CC6.1 |

### CWE-176 — Improper Handling of Unicode Encoding

| Framework | Mapping |
|-----------|---------|
| OWASP Top 10 2021 | A03:2021 — Injection (adjacent) |
| NIST SP 800-53 Rev.5 | SI-10 |
| ISO 27001:2022 | A.8.28 |

### CWE-367 — Time-of-check Time-of-use (TOCTOU) Race Condition

| Framework | Mapping |
|-----------|---------|
| OWASP Top 10 2021 | A04:2021 — Insecure Design |
| NIST SP 800-53 Rev.5 | SI-10, SA-11 (Developer Testing) |
| ISO 27001:2022 | A.8.28 |
| MITRE ATT&CK | T1611 (Escape to Host) — adjacent, in containerized builds |

### CWE-353 — Missing Support for Integrity Check

| Framework | Mapping |
|-----------|---------|
| OWASP Top 10 2021 | A08:2021 — Software & Data Integrity Failures |
| OWASP LLM Top 10 2025 | LLM03 — Supply Chain (training-time) — adjacent; here it is runtime asset integrity |
| NIST SP 800-53 Rev.5 | SI-7 (Software, Firmware & Information Integrity) |
| EU AI Act | Art. 15 (Cybersecurity) |
| ISO 27001:2022 | A.8.25 (Secure development lifecycle), A.5.37 (Documented operating procedures) |
| SOC 2 | CC7.1 (Detection & monitoring of changes) |
| MITRE ATT&CK | T1195.002 (Supply Chain Compromise: Software Supply Chain) |

### CWE-400 — Uncontrolled Resource Consumption

| Framework | Mapping |
|-----------|---------|
| OWASP Top 10 2021 | A04:2021 — Insecure Design |
| NIST SP 800-53 Rev.5 | SC-5 (DoS Protection) |
| EU AI Act | Art. 15 (Robustness) |
| ISO 27001:2022 | A.8.6 (Capacity management) |
| SOC 2 | A1.1 (Availability / capacity) |
| MITRE ATT&CK | T1499 (Endpoint DoS) |

### CWE-601 — URL Redirection to Untrusted Site (Open Redirect)

| Framework | Mapping |
|-----------|---------|
| OWASP Top 10 2021 | A01:2021 (Broken Access Control) — adjacent; A03 (Injection) — also adjacent |
| NIST SP 800-53 Rev.5 | SC-7 (Boundary Protection) |
| ISO 27001:2022 | A.8.26 |
| SOC 2 | CC6.6 (Boundary protection) |
| MITRE ATT&CK | T1204.001 (User Execution: Malicious Link) |

### CWE-693 — Protection Mechanism Failure

| Framework | Mapping |
|-----------|---------|
| OWASP Top 10 2021 | A05:2021 — Security Misconfiguration |
| NIST SP 800-53 Rev.5 | CM-6 (Configuration Settings), CM-7 (Least Functionality) |
| EU AI Act | Art. 15 (Cybersecurity) |
| ISO 27001:2022 | A.8.9 (Configuration management) |
| SOC 2 | CC6.8 (Protecting against unauthorized software) |
| MITRE ATT&CK | T1189 (Drive-by Compromise) — mitigation context |

### CWE-1021 — Improper Restriction of Rendered UI Layers or Frames (Clickjacking)

| Framework | Mapping |
|-----------|---------|
| OWASP Top 10 2021 | A05:2021 |
| NIST SP 800-53 Rev.5 | SC-7, AC-4 (Information Flow Enforcement) |
| ISO 27001:2022 | A.8.23 (Web filtering) |
| SOC 2 | CC6.6 |
| MITRE ATT&CK | T1185 (Browser Session Hijacking) — adjacent |

### CWE-1022 — Use of Web Link to Untrusted Target with Window.opener Access

| Framework | Mapping |
|-----------|---------|
| OWASP Top 10 2021 | A05:2021 |
| NIST SP 800-53 Rev.5 | SC-7, AC-4 |
| ISO 27001:2022 | A.8.23, A.8.28 |
| SOC 2 | CC6.6 |
| MITRE ATT&CK | T1204.001 |

---

## Aggregate Compliance Matrix

For each framework, the tally of distinct findings that touch it:

| Framework | CRITICAL | HIGH | MEDIUM | LOW | Notes |
|-----------|:--------:|:----:|:------:|:---:|-------|
| **OWASP Top 10 2021** — A01 (Broken Access Control) | 0 | 3 | 0 | 1 | All 3 HIGH are inherited CWE-22 from tar CVE; L-03 redirect |
| **OWASP Top 10 2021** — A03 (Injection) | 0 | 0 | 0 | 2 | L-04 input-validation adjacency, CWE-176 tangential |
| **OWASP Top 10 2021** — A04 (Insecure Design) | 0 | 1 | 0 | 1 | CWE-367 race, CWE-400 resource |
| **OWASP Top 10 2021** — A05 (Security Misconfig) | 0 | 0 | 2 | 0 | M-01 tabnabbing, M-02 CSP |
| **OWASP Top 10 2021** — A08 (Integrity Failures) | 0 | 0 | 0 | 1 | L-01 SRI |
| **OWASP LLM Top 10 2025** — LLM03 (Supply Chain) | 0 | 0 | 0 | 1 | L-01 CDN integrity (runtime SC asset) |
| **OWASP LLM Top 10 2025** — LLM05 (Improper Output Handling) | 0 | 0 | 0 | 1 | L-04 adjacency |
| **NIST SP 800-53 Rev.5** — SI-10 (Input Validation) | 0 | 3 | 0 | 1 | |
| **NIST SP 800-53 Rev.5** — SI-7 (SW/FW Integrity) | 0 | 0 | 0 | 1 | L-01 |
| **NIST SP 800-53 Rev.5** — CM-6 / CM-7 (Config) | 0 | 0 | 2 | 0 | M-01, M-02 |
| **NIST SP 800-53 Rev.5** — SC-5 (DoS Protection) | 0 | 0 | 0 | 1 | L-02 |
| **NIST SP 800-53 Rev.5** — SC-7 (Boundary) | 0 | 0 | 2 | 1 | M-01, M-02, L-03 |
| **EU AI Act** — Art. 15 (Cybersecurity & Robustness) | 0 | 3 | 2 | 2 | Applies mainly because dev-deps ship through AI-assisted tooling |
| **EU AI Act** — Art. 25 (Supply chain) | 0 | 3 | 0 | 1 | Dev-dep CVEs + SRI |
| **ISO 27001:2022** — A.8.28 (Secure coding) | 0 | 3 | 1 | 2 | All CWE-22/176/367 + M-01 + L-04 |
| **ISO 27001:2022** — A.8.9 (Config management) | 0 | 0 | 2 | 0 | |
| **ISO 27001:2022** — A.8.25 (SDL) | 0 | 0 | 0 | 1 | L-01 |
| **ISO 27001:2022** — A.8.6 (Capacity) | 0 | 0 | 0 | 1 | L-02 |
| **ISO 27001:2022** — A.8.23 (Web filtering) | 0 | 0 | 2 | 0 | M-01, M-02 |
| **ISO 27001:2022** — A.5.23 (Supplier cloud) | 0 | 3 | 0 | 0 | |
| **SOC 2** — CC6.1 (Logical access) | 0 | 3 | 0 | 0 | Supply-chain path-traversal |
| **SOC 2** — CC6.6 (Boundary protection) | 0 | 0 | 2 | 1 | M-01, M-02, L-03 |
| **SOC 2** — CC7.1 (Change monitoring) | 0 | 0 | 0 | 1 | L-01 |
| **SOC 2** — CC8.1 (Change management) | 0 | 0 | 0 | 1 | L-04 |
| **SOC 2** — A1.1 (Availability) | 0 | 0 | 0 | 1 | L-02 |
| **MITRE ATT&CK** — T1195.002 (SW Supply Chain) | 0 | 3 | 0 | 1 | Dev-dep CVEs + L-01 |
| **MITRE ATT&CK** — T1204.001 (Malicious Link) | 0 | 0 | 1 | 1 | M-01, L-03 |
| **MITRE ATT&CK** — T1499 (Endpoint DoS) | 0 | 0 | 0 | 1 | L-02 |
| **MITRE ATLAS** — AML.T0036 (Data from Info Repo) | 0 | 3 | 0 | 0 | Supply-chain adjacency |

---

## Heat-map (Visual Summary)

```
                      CRITICAL  HIGH  MEDIUM  LOW
OWASP A01                 .      ███    .     █
OWASP A03                 .      .      .     ██
OWASP A04                 .      █      .     █
OWASP A05                 .      .      ██    .
OWASP A08                 .      .      .     █
OWASP LLM03               .      .      .     █
OWASP LLM05               .      .      .     █
NIST SI-10                .      ███    .     █
NIST SC-7                 .      .      ██    █
EU AI Act Art.15          .      ███    ██    ██
EU AI Act Art.25          .      ███    .     █
ISO A.8.28                .      ███    █     ██
SOC2 CC6.1                .      ███    .     .
SOC2 CC6.6                .      .      ██    █
ATT&CK T1195.002          .      ███    .     █
ATT&CK T1204.001          .      .      █     █
```

No critical hits in any framework. The HIGH-density row is the supply-chain transitive (tar / pacote / Angular CLI) which fans out across every framework's "supplier" and "supply chain" control family. All HIGH are dev-time, not runtime.

---

## Compliance Readiness Gap Summary

| Framework | Current Posture | Required to Claim "Compliant" | Gap |
|-----------|-----------------|------------------------------|----:|
| EU AI Act Art.15 | Not applicable at runtime (no AI in prod); applies at dev-time | Evidence that AI-assisted work was reviewed and signed off by human | Small — this audit + commit-level attribution helps |
| NIST SSDF (800-218) | ~50% | Add CI, tests, SBOM, SECURITY.md | Medium |
| ISO 27001:2022 | Controls present informally | Documented policies, risk register, evidence of review | Large (ISO needs an ISMS — not feasible for a solo project) |
| SOC 2 TSC | Informal control presence | Type I audit attestation | Not applicable (consumer, not SaaS contract) |
| SLSA v1.0 | L0 | L1 = scripted build + provenance | Small — ~45 min of CI work |

---

## Recommendations (Mapping-Driven)

1. **Close CWE-1022 + CWE-601** (M-01, L-03): add `rel="noopener noreferrer"` / `noopener` to all 5 dynamic-href links + the brochure popup. 10 min.
2. **Close CWE-693 / CWE-1021** (M-02): add CSP meta tag. 15 min + regression test. Biggest single framework-coverage lift (NIST CM-6, ISO A.8.9, SOC 2 CC6.6 all improve).
3. **Close CWE-353** (L-01): pin jsDelivr font CSS with SRI. 10 min.
4. **Reduce CWE-22 exposure**: plan Angular 19 → 21 upgrade; in the meantime, rely on lockfile and ephemeral CI runners. Accept residual risk in writing (this document is the record).
5. **Close CWE-20** (L-04): adopt Zod schemas on the 6 most-consumed API shapes. ~4 h of work; largest NIST SI-10 / ISO A.8.28 coverage gain.

The mapping shows that the app's real compliance risk is clustered in **supply-chain controls** and **security-misconfiguration** — both addressable with low-hanging fixes plus a future dep major-upgrade. Application-logic risk (injection, auth, crypto) is **absent** — a credit to Angular's default template escaping and the disciplined decision to avoid `innerHTML` / `DomSanitizer.bypass*`.
