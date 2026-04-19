# CWE & Compliance Framework Mapping
## retirement-dashboard-angular

| Field | Value |
|-------|-------|
| **Project** | retirement-dashboard-angular |
| **Mapping Date** | 2026-04-20 |
| **Commit** | cf2ed63 |
| **Branch** | feature/aca-cliff-tax-service-refactor |
| **Source Findings** | `sast-dast-scan-2026-04-20.md` (4 app findings OPEN, 2 CLOSED), `supply-chain-audit.md` (3 dev-dep CVEs still OPEN) |
| **Frameworks Mapped** | OWASP Top 10 2021, OWASP LLM Top 10 2025, NIST SP 800-53 Rev.5, EU AI Act (Art. 10, 14, 25, 52, 53), ISO 27001:2022, SOC 2 TSC, MITRE ATT&CK, MITRE ATLAS |
| **Supersedes** | `audits/cwe-mapping.md` (2026-04-19, commit 86e7fd7) |

**Delta since 2026-04-19**: 3 CWEs moved from OPEN -> CLOSED — **CWE-1022** (reverse tabnabbing, M-01), **CWE-693** (protection mechanism failure, M-02), and **CWE-1021** (clickjacking, M-02). Net: 8 CWEs remain OPEN, 3 CWEs now CLOSED, 0 ACCEPTED with no mitigation plan. Conclusion unchanged: **no CRITICAL hits in any framework**.

---

## Findings -> CWE (Status Annotated)

| ID | Severity | CWE(s) | Status | Finding |
|----|----------|--------|:------:|---------|
| M-01 | Medium | CWE-1022 | **CLOSED** | Reverse tabnabbing: `target="_blank"` without `rel="noopener noreferrer"` — all 5 dynamic-href links remediated |
| M-02 | Medium | CWE-693, CWE-1021 | **CLOSED** | Content-Security-Policy meta tag added to `src/index.html` |
| L-01 | Low | CWE-353 | **OPEN** | No Subresource Integrity on CDN font CSS |
| L-02 | Low | CWE-400 | **OPEN** | Unthrottled `localStorage.setItem` writes |
| L-03 | Low | CWE-601 | **OPEN** | `window.open` of blob URL without `noopener` |
| L-04 | Low | CWE-20 | **OPEN** | No runtime HTTP response-shape validation |
| DEP-1 | High | CWE-22, CWE-59, CWE-176, CWE-367 | **OPEN** | `tar < 7.5.10` (6 chained CVEs) — dev-dep only |
| DEP-2 | High | CWE-22 (inherited) | **OPEN** | `pacote` depends on vulnerable tar — dev-dep only |
| DEP-3 | High | CWE-22 (inherited) | **OPEN** | `@angular/cli` depends on vulnerable pacote — dev-dep only |

**Evidence (closures):**
- `src/app/components/screens/localinfo-screen/localinfo-screen.component.ts:101,109,117,125` — `rel="noopener noreferrer"` added to all 4 `<a>` tags.
- `src/app/components/screens/services-screen/services-screen.component.ts:62` — `rel="noopener noreferrer"` added.
- `src/index.html` — `<meta http-equiv="Content-Security-Policy" ...>` tag now present with `default-src 'self'`, `frame-ancestors 'none'`, script-src with hash allowlist. See `sast-dast-scan-2026-04-20.md` §"M-02 resolution".

---

## Per-CWE Mapping

### CWE-20 — Improper Input Validation — **OPEN**

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

### CWE-22 — Improper Limitation of a Pathname to a Restricted Directory (Path Traversal) — **OPEN**

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

### CWE-59 — Improper Link Resolution Before File Access (Link Following) — **OPEN**

| Framework | Mapping |
|-----------|---------|
| OWASP Top 10 2021 | A01:2021 — Broken Access Control |
| NIST SP 800-53 Rev.5 | AC-3, SI-10 |
| ISO 27001:2022 | A.8.28 |
| SOC 2 | CC6.1 |

### CWE-176 — Improper Handling of Unicode Encoding — **OPEN**

| Framework | Mapping |
|-----------|---------|
| OWASP Top 10 2021 | A03:2021 — Injection (adjacent) |
| NIST SP 800-53 Rev.5 | SI-10 |
| ISO 27001:2022 | A.8.28 |

### CWE-367 — Time-of-check Time-of-use (TOCTOU) Race Condition — **OPEN**

| Framework | Mapping |
|-----------|---------|
| OWASP Top 10 2021 | A04:2021 — Insecure Design |
| NIST SP 800-53 Rev.5 | SI-10, SA-11 (Developer Testing) |
| ISO 27001:2022 | A.8.28 |
| MITRE ATT&CK | T1611 (Escape to Host) — adjacent, in containerized builds |

### CWE-353 — Missing Support for Integrity Check — **OPEN**

| Framework | Mapping |
|-----------|---------|
| OWASP Top 10 2021 | A08:2021 — Software & Data Integrity Failures |
| OWASP LLM Top 10 2025 | LLM03 — Supply Chain (training-time) — adjacent; here it is runtime asset integrity |
| NIST SP 800-53 Rev.5 | SI-7 (Software, Firmware & Information Integrity) |
| EU AI Act | Art. 15 (Cybersecurity) |
| ISO 27001:2022 | A.8.25 (Secure development lifecycle), A.5.37 (Documented operating procedures) |
| SOC 2 | CC7.1 (Detection & monitoring of changes) |
| MITRE ATT&CK | T1195.002 (Supply Chain Compromise: Software Supply Chain) |

### CWE-400 — Uncontrolled Resource Consumption — **OPEN**

| Framework | Mapping |
|-----------|---------|
| OWASP Top 10 2021 | A04:2021 — Insecure Design |
| NIST SP 800-53 Rev.5 | SC-5 (DoS Protection) |
| EU AI Act | Art. 15 (Robustness) |
| ISO 27001:2022 | A.8.6 (Capacity management) |
| SOC 2 | A1.1 (Availability / capacity) |
| MITRE ATT&CK | T1499 (Endpoint DoS) |

### CWE-601 — URL Redirection to Untrusted Site (Open Redirect) — **OPEN**

| Framework | Mapping |
|-----------|---------|
| OWASP Top 10 2021 | A01:2021 (Broken Access Control) — adjacent; A03 (Injection) — also adjacent |
| NIST SP 800-53 Rev.5 | SC-7 (Boundary Protection) |
| ISO 27001:2022 | A.8.26 |
| SOC 2 | CC6.6 (Boundary protection) |
| MITRE ATT&CK | T1204.001 (User Execution: Malicious Link) |

### CWE-693 — Protection Mechanism Failure — **CLOSED (2026-04-20)**

Mitigation: CSP meta tag deployed in `src/index.html`. Evidence: `sast-dast-scan-2026-04-20.md` §M-02 resolution. Control coverage gained across CM-6, A.8.9, CC6.8.

| Framework | Mapping | Residual |
|-----------|---------|----------|
| OWASP Top 10 2021 | A05:2021 — Security Misconfiguration | Mitigated |
| NIST SP 800-53 Rev.5 | CM-6 (Configuration Settings), CM-7 (Least Functionality) | Mitigated |
| EU AI Act | Art. 15 (Cybersecurity) | Mitigated |
| ISO 27001:2022 | A.8.9 (Configuration management) | Mitigated |
| SOC 2 | CC6.8 (Protecting against unauthorized software) | Mitigated |
| MITRE ATT&CK | T1189 (Drive-by Compromise) — mitigation context | Mitigated |

### CWE-1021 — Improper Restriction of Rendered UI Layers or Frames (Clickjacking) — **CLOSED (2026-04-20)**

Mitigation: CSP `frame-ancestors 'none'` directive in `src/index.html`. Evidence: `sast-dast-scan-2026-04-20.md` §M-02 resolution.

| Framework | Mapping | Residual |
|-----------|---------|----------|
| OWASP Top 10 2021 | A05:2021 | Mitigated |
| NIST SP 800-53 Rev.5 | SC-7, AC-4 (Information Flow Enforcement) | Mitigated |
| ISO 27001:2022 | A.8.23 (Web filtering) | Mitigated |
| SOC 2 | CC6.6 | Mitigated |
| MITRE ATT&CK | T1185 (Browser Session Hijacking) — adjacent | Mitigated |

### CWE-1022 — Use of Web Link to Untrusted Target with Window.opener Access — **CLOSED (2026-04-20)**

Mitigation: `rel="noopener noreferrer"` on all 5 external-target anchors in `localinfo-screen.component.ts` (lines 101, 109, 117, 125) and `services-screen.component.ts` (line 62). Evidence: `sast-dast-scan-2026-04-20.md` §M-01 resolution.

| Framework | Mapping | Residual |
|-----------|---------|----------|
| OWASP Top 10 2021 | A05:2021 | Mitigated |
| NIST SP 800-53 Rev.5 | SC-7, AC-4 | Mitigated |
| ISO 27001:2022 | A.8.23, A.8.28 | Mitigated |
| SOC 2 | CC6.6 | Mitigated |
| MITRE ATT&CK | T1204.001 | Mitigated |

---

## Aggregate Compliance Matrix

For each framework, the tally of **OPEN** distinct findings that touch it (CLOSED items excluded from counts; listed in Notes):

| Framework | CRITICAL | HIGH | MEDIUM | LOW | Notes |
|-----------|:--------:|:----:|:------:|:---:|-------|
| **OWASP Top 10 2021** — A01 (Broken Access Control) | 0 | 3 | 0 | 1 | All 3 HIGH are inherited CWE-22 from tar CVE; L-03 redirect |
| **OWASP Top 10 2021** — A03 (Injection) | 0 | 0 | 0 | 2 | L-04 input-validation adjacency, CWE-176 tangential |
| **OWASP Top 10 2021** — A04 (Insecure Design) | 0 | 1 | 0 | 1 | CWE-367 race, CWE-400 resource |
| **OWASP Top 10 2021** — A05 (Security Misconfig) | 0 | 0 | 0 | 0 | M-01 + M-02 CLOSED |
| **OWASP Top 10 2021** — A08 (Integrity Failures) | 0 | 0 | 0 | 1 | L-01 SRI |
| **OWASP LLM Top 10 2025** — LLM03 (Supply Chain) | 0 | 0 | 0 | 1 | L-01 CDN integrity (runtime SC asset) |
| **OWASP LLM Top 10 2025** — LLM05 (Improper Output Handling) | 0 | 0 | 0 | 1 | L-04 adjacency |
| **NIST SP 800-53 Rev.5** — SI-10 (Input Validation) | 0 | 3 | 0 | 1 | |
| **NIST SP 800-53 Rev.5** — SI-7 (SW/FW Integrity) | 0 | 0 | 0 | 1 | L-01 |
| **NIST SP 800-53 Rev.5** — CM-6 / CM-7 (Config) | 0 | 0 | 0 | 0 | M-02 CLOSED |
| **NIST SP 800-53 Rev.5** — SC-5 (DoS Protection) | 0 | 0 | 0 | 1 | L-02 |
| **NIST SP 800-53 Rev.5** — SC-7 (Boundary) | 0 | 0 | 0 | 1 | M-01 + M-02 CLOSED; L-03 remains |
| **EU AI Act** — Art. 15 (Cybersecurity & Robustness) | 0 | 3 | 0 | 2 | M-02 CLOSED |
| **EU AI Act** — Art. 25 (Supply chain) | 0 | 3 | 0 | 1 | Dev-dep CVEs + SRI |
| **ISO 27001:2022** — A.8.28 (Secure coding) | 0 | 3 | 0 | 1 | All CWE-22/176/367 + L-04; M-01 CLOSED |
| **ISO 27001:2022** — A.8.9 (Config management) | 0 | 0 | 0 | 0 | M-02 CLOSED |
| **ISO 27001:2022** — A.8.25 (SDL) | 0 | 0 | 0 | 1 | L-01 |
| **ISO 27001:2022** — A.8.6 (Capacity) | 0 | 0 | 0 | 1 | L-02 |
| **ISO 27001:2022** — A.8.23 (Web filtering) | 0 | 0 | 0 | 0 | M-01 + M-02 CLOSED |
| **ISO 27001:2022** — A.5.23 (Supplier cloud) | 0 | 3 | 0 | 0 | |
| **SOC 2** — CC6.1 (Logical access) | 0 | 3 | 0 | 0 | Supply-chain path-traversal |
| **SOC 2** — CC6.6 (Boundary protection) | 0 | 0 | 0 | 1 | M-01 + M-02 CLOSED; L-03 remains |
| **SOC 2** — CC6.8 (Unauthorized software) | 0 | 0 | 0 | 0 | M-02 CLOSED |
| **SOC 2** — CC7.1 (Change monitoring) | 0 | 0 | 0 | 1 | L-01 |
| **SOC 2** — CC8.1 (Change management) | 0 | 0 | 0 | 1 | L-04 |
| **SOC 2** — A1.1 (Availability) | 0 | 0 | 0 | 1 | L-02 |
| **MITRE ATT&CK** — T1195.002 (SW Supply Chain) | 0 | 3 | 0 | 1 | Dev-dep CVEs + L-01 |
| **MITRE ATT&CK** — T1204.001 (Malicious Link) | 0 | 0 | 0 | 1 | M-01 CLOSED; L-03 remains |
| **MITRE ATT&CK** — T1499 (Endpoint DoS) | 0 | 0 | 0 | 1 | L-02 |
| **MITRE ATLAS** — AML.T0036 (Data from Info Repo) | 0 | 3 | 0 | 0 | Supply-chain adjacency |

---

## Heat-map (Visual Summary)

```
                      CRITICAL  HIGH  MEDIUM  LOW
OWASP A01                 .      ███    .     █
OWASP A03                 .      .      .     ██
OWASP A04                 .      █      .     █
OWASP A05                 .      .      .     .      (was ██; M-01+M-02 CLOSED)
OWASP A08                 .      .      .     █
OWASP LLM03               .      .      .     █
OWASP LLM05               .      .      .     █
NIST SI-10                .      ███    .     █
NIST SC-7                 .      .      .     █      (was ██; M-01+M-02 CLOSED)
NIST CM-6/CM-7            .      .      .     .      (was ██; M-02 CLOSED)
EU AI Act Art.15          .      ███    .     ██     (was ██; M-02 CLOSED)
EU AI Act Art.25          .      ███    .     █
ISO A.8.28                .      ███    .     █      (was █ MED; M-01 CLOSED)
ISO A.8.23                .      .      .     .      (was ██; M-01+M-02 CLOSED)
SOC2 CC6.1                .      ███    .     .
SOC2 CC6.6                .      .      .     █      (was ██; M-01+M-02 CLOSED)
ATT&CK T1195.002          .      ███    .     █
ATT&CK T1204.001          .      .      .     █      (was █ MED; M-01 CLOSED)
```

**No critical hits in any framework.** The MEDIUM column across A05, NIST CM-6, ISO A.8.23, SOC2 CC6.6, and ATT&CK T1204.001 is now empty — a direct result of closing M-01 (CWE-1022) and M-02 (CWE-693, CWE-1021). The HIGH-density row remains the supply-chain transitive (tar / pacote / Angular CLI) which fans out across every framework's "supplier" and "supply chain" control family. All HIGH are dev-time, not runtime.

---

## Compliance Readiness Gap Summary

| Framework | Current Posture | Required to Claim "Compliant" | Gap |
|-----------|-----------------|------------------------------|----:|
| EU AI Act Art.15 | Not applicable at runtime (no AI in prod); applies at dev-time | Evidence that AI-assisted work was reviewed and signed off by human | Small — this audit + commit-level attribution helps |
| NIST SSDF (800-218) | ~55% (was ~50%; CSP + rel=noopener bump SI-10/SC-7 coverage) | Add CI, tests, SBOM, SECURITY.md | Medium |
| ISO 27001:2022 | Controls present informally; A.8.9 + A.8.23 now cleanly covered | Documented policies, risk register, evidence of review | Large (ISO needs an ISMS — not feasible for a solo project) |
| SOC 2 TSC | Informal control presence; CC6.6 + CC6.8 improved | Type I audit attestation | Not applicable (consumer, not SaaS contract) |
| SLSA v1.0 | L0 | L1 = scripted build + provenance | Small — ~45 min of CI work |

---

## Recommendations (Mapping-Driven, Updated)

1. ~~**Close CWE-1022 + CWE-601** (M-01, L-03): add `rel="noopener noreferrer"` / `noopener`.~~ **DONE for M-01 (2026-04-20)**. L-03 (blob popup) still open — trivial ~5 min fix.
2. ~~**Close CWE-693 / CWE-1021** (M-02): add CSP meta tag.~~ **DONE (2026-04-20)**. Validate hash-allowlist in CI on every index.html change.
3. **Close CWE-353** (L-01): pin jsDelivr font CSS with SRI hash. 10 min.
4. **Reduce CWE-22 exposure** (DEP-1/2/3): plan Angular 19 -> 21 upgrade; until then rely on lockfile + ephemeral CI runners. Accept residual risk in writing (this document is the record).
5. **Close CWE-20** (L-04): adopt Zod schemas on the 6 most-consumed API shapes. ~4 h of work; largest NIST SI-10 / ISO A.8.28 coverage gain.
6. **Close CWE-400** (L-02): debounce/throttle `localStorage.setItem` writes via the existing persistence service. ~30 min.

The mapping shows the app's real residual compliance risk is now almost entirely in **supply-chain controls** (dev-dep CVEs) and **runtime asset integrity** (L-01 SRI) — both addressable with low-hanging fixes plus a future dep major-upgrade. The **A05 (Security Misconfiguration)** cluster has fully cleared with the M-01 + M-02 closures. Application-logic risk (injection, auth, crypto) remains **absent** — a credit to Angular's default template escaping and the disciplined decision to avoid `innerHTML` / `DomSanitizer.bypass*`.
