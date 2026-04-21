# CWE Mapping — 2026-04-21

| Field | Value |
|-------|-------|
| **Project** | retirement-dashboard-angular |
| **Date** | 2026-04-21 |
| **Baseline** | `audits/cwe-mapping-2026-04-20.md` |
| **Change set** | 11 new screens + 9 modified files (Map, MC export/print, Sankey, Report, IRMAA, Guardrails, QoL, Visa, Healthcare Compare, Estate, Climate; api.service.ts, location.service.ts, fees/fire/inclusion screens) |
| **Frameworks** | OWASP Top 10 2021, OWASP LLM Top 10 2025, NIST SP 800-53 Rev.5, EU AI Act Art. 25, ISO 27001:2022, SOC 2 TSC, MITRE ATT&CK, MITRE ATLAS |

---

## Delta from 2026-04-20 baseline

| CWE | Baseline | This session | Net |
|---|---|---|---|
| CWE-79 (XSS) | Not present | New surface, ADDRESSED | 0 net OPEN |
| CWE-116 (Improper Encoding) | Not present | New surface, ADDRESSED (in-audit fix for newline escape) | 0 net OPEN |
| CWE-400 (Resource Exhaustion) | OPEN (L-02 localStorage) | Fan-out ADDRESSED; L-02 remains | 0 net change |
| CWE-1021/1022 (Rendered UI / window.opener) | CLOSED (CSP) | New MC instance RESOLVED in-audit | 0 new residuals |
| CWE-20 (Input Validation) | OPEN (L-04) | Write-path PARTIALLY ADDRESSED; L-04 remains | No net change |
| CWE-1188 / CWE-918 | — | Investigated, not a finding | — |

---

## Per-CWE mappings

### CWE-79: Cross-Site Scripting (Stored/DOM)

- **Relevance:** Three new non-Angular-template HTML generation sites: Leaflet popup HTML (`map-screen`), standalone SVG export (`montecarlo-screen`), YAML front-matter in Markdown download (`report-screen`).
- **Affected:** `map-screen.component.ts:344-350`, `montecarlo-screen.component.ts:1665-1719`, `report-screen.component.ts:827-832`
- **Mitigation status:** ADDRESSED. Each site has a purpose-built escape function applied at every user-data interpolation. Markdown body is downloaded as a blob (not rendered to DOM), no XSS surface.
- **Frameworks:**
  - OWASP Top 10 2021: A03 — Injection
  - OWASP LLM Top 10 2025: LLM02 — Insecure Output Handling
  - NIST SP 800-53: SI-10, SI-15
  - ISO 27001 A.8.28
  - SOC 2 TSC: CC6.1
  - MITRE ATT&CK: T1059.007 (adjacent)

### CWE-116: Improper Encoding or Escaping of Output

- **Relevance:** YAML front-matter (report-screen) and SVG text (MC export) require encoding disciplines Angular's template engine doesn't provide.
- **Affected:** `report-screen.component.ts:827-832` (`yamlStr`), `montecarlo-screen.component.ts:1665-1667` (SVG `esc`)
- **Mitigation status:** ADDRESSED. `yamlStr()` detects YAML-special characters and wraps in quoted scalars. Fixed in-audit to also escape `\n` and `\r`. SVG escape handles the five XML entity characters.
- **Frameworks:** OWASP A03, OWASP LLM02, NIST SI-10/15, ISO A.8.28, SOC 2 CC6.1

### CWE-400: Uncontrolled Resource Consumption

- **Relevance:** Fixed the N per-location HTTP GET fan-out that previously tripped the API rate limiter with larger selections. `api.service.ts` now exposes `batchLoadSupplements()` (single POST); `location.service.ts` uses it with an idempotency guard.
- **Affected:** `api.service.ts:58-65`, `location.service.ts:195-218`
- **Mitigation status:** ADDRESSED (fan-out). OPEN (L-02): unthrottled `localStorage.setItem` — unchanged from baseline.
- **Frameworks:** OWASP A04, NIST SC-5, EU AI Act Art. 15, ISO A.8.6, SOC 2 A1.1, ATT&CK T1499

### ✅ CWE-1021 / CWE-1022: Improper Restriction of Rendered UI Layers — RESOLVED

- **Relevance:** MC print opened blob URL with `window.open(url, '_blank', 'width=820,height=1000')` — `noopener` absent.
- **Affected:** `montecarlo-screen.component.ts:1631`
- **Mitigation status:** RESOLVED in-audit. Added `noopener,noreferrer` to features string. Blob revocation moved to timeout fallback (2.5s) since `load` event is unavailable under noopener.
- **Frameworks:** OWASP A05, NIST SC-7, ISO A.8.23, SOC 2 CC6.6

### CWE-20: Improper Input Validation

- **Relevance:** `updateFinancial` strips `userId`, `updatedAt`, and `_`-prefixed keys before PUT — prevents callers that forward the full GET response from triggering backend Zod 400s.
- **Affected:** `api.service.ts:105-116`
- **Mitigation status:** PARTIALLY ADDRESSED (write path). OPEN (L-04): no runtime schema validation on HTTP responses — unchanged.
- **Frameworks:** OWASP A03 (adjacent), OWASP LLM05, NIST SI-10/15, EU AI Act Art. 15, ISO A.8.26/28, SOC 2 CC8.1

### CWE-918: SSRF — NOT APPLICABLE

CartoDB tile URL is a Leaflet hardcoded template string. `{s}/{z}/{x}/{y}` tokens are populated by Leaflet from integer tile coordinates derived from the viewport — no user input reaches the network call. CSP `img-src` further constrains origins. No SSRF surface.

### CWE-1188: Insecure Default Initialization — NOT A FINDING

`formatCurrency(amount, unit = '/mo')` is a display-label annotation, not a numeric default. FIRE screens explicitly pass `''`. MC screen's per-month fmt() correctly defaults to `/mo`. No insecure numeric default.

---

## Aggregate compliance matrix

| Framework | OPEN (this session) | Notes |
|---|:---:|---|
| OWASP A03 (Injection / XSS) | 0 | CWE-79 + CWE-116 both addressed |
| OWASP A04 (Insecure Design) | 1 LOW | L-02 localStorage; fan-out fixed |
| OWASP A05 (Security Misconfig) | 0 | MC window.open fix closed the new residual |
| OWASP A08 (Integrity Failures) | 1 LOW | L-01 SRI — unchanged |
| OWASP LLM02 (Insecure Output) | 0 | All new output sites addressed |
| NIST SI-10 (Input Validation) | 1 LOW | L-04 read-path Zod |
| NIST SC-5 (DoS) | 1 LOW | L-02 |
| NIST SC-7 (Boundary) | 1 LOW | L-03 brochure window.open (unchanged) |
| EU AI Act Art. 15 (Robustness) | 1 LOW | L-02 |
| ISO A.8.28 (Secure coding) | 1 LOW | L-04 |
| ISO A.8.6 (Capacity) | 1 LOW | L-02 |
| SOC 2 A1.1 (Availability) | 1 LOW | L-02 |
| SOC 2 CC6.6 (Boundary) | 1 LOW | L-03 |
| ATT&CK T1499 (DoS) | 1 LOW | L-02 |
| ATT&CK T1185 (Session Hijacking) | 1 LOW | L-03 |

**No CRITICAL or HIGH application-layer findings.** The MC `noopener` gap that would have been L-05 was fixed in-audit.

## Open items register (cumulative)

| ID | CWE | Severity | Description | Effort |
|---|---|:---:|---|---|
| L-01 | CWE-353 | LOW | No SRI on jsDelivr font CSS | 10 min |
| L-02 | CWE-400 | LOW | Unthrottled localStorage.setItem | 30 min |
| L-03 | CWE-601/1021 | LOW | Brochure window.open without noopener (same class as fixed MC) | 10 min |
| L-04 | CWE-20 | LOW | No Zod schema on API response shapes | ~4 h |

**Suggestion:** apply the same `noopener,noreferrer` + timeout-fallback fix from this audit to the brochure screen (L-03) on next pass — identical pattern, 10-min fix.
