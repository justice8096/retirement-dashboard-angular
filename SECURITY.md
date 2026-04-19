# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in `retirement-dashboard-angular`,
please report it responsibly.

1. **Do NOT** open a public GitHub issue.
2. Email: **justice8096+security@gmail.com**
3. Include: description, reproduction steps, potential impact, and any PoC.
4. You will receive an acknowledgement within **2 business days**.

### Disclosure SLA

| Severity | First ack | Triage | Fix target |
|---|---|---|---|
| Critical (XSS, auth bypass, credential leak) | < 24 h | < 3 days | **< 7 days** |
| High | < 2 days | < 5 days | < 14 days |
| Medium | < 3 days | < 10 days | < 30 days |
| Low / Info | < 5 days | Best-effort | Next maintenance window |

Public disclosure follows the fix landing on `main`, plus a 7-day grace
period. Coordinated disclosure with shorter windows is negotiated
case-by-case.

---

## Scope

This repository covers the **Angular 19 SPA** only. Backend / API
vulnerabilities belong to the paired [`retirement-api`](https://github.com/justice8096/retirement-api)
project — report those via its `SECURITY.md`.

### In scope
- `src/app/**` — components, services, directives, models
- `src/styles.scss` — global styles (including accessibility overrides)
- `src/index.html` — CSP meta tag and font loading
- `scripts/` — dev-tooling (readability lint)

### Out of scope
- Issues in third-party dependencies not yet patched upstream — those
  are tracked via `npm audit` and Dependabot; file a report only if the
  dependency maintainer has not responded within a reasonable window.
- Issues that require the attacker to already control the user's device
  (shoulder-surfing, clipboard reading, browser extensions with broad
  permissions, etc.).

---

## Security Measures (current)

### Content Security Policy
A strict CSP meta tag ships in `src/index.html` with `default-src
'self'` plus explicit allow-lists for Google Fonts + jsDelivr (fonts only),
OpenStreetMap + CartoCDN (map tiles), and `connect-src 'self'`. No
inline scripts. No `object-src`. `frame-ancestors 'none'` blocks
click-jacking.

### Output escaping
Angular's default context-aware escaping is relied on throughout. The
repo is verified free of unsafe DOM sinks — no `innerHTML` property
binding, no `DomSanitizer` bypass calls, no `eval`-style dynamic code
execution. Enforced in CI via `grep` guardrails in
`.github/workflows/ci.yml`.

### External links
Every `target="_blank"` anchor carries `rel="noopener noreferrer"`
(closes reverse-tabnabbing — SAST M-01, 2026-04-19).

### Local storage
Stores only accessibility preferences (font size, dyscalculia settings,
dyslexia settings). No tokens, no PII, no financial data.

### Authentication
Delegated to [`retirement-api`](https://github.com/justice8096/retirement-api)
— the dashboard does not handle session tokens directly. Session cookies
are set by the API with `Secure; HttpOnly; SameSite=Lax`.

---

## Audit cadence

Compliance + security audits live in [`audits/`](audits/) and are
refreshed on every major cycle. Most recent set: **2026-04-20**.

- `audits/sast-dast-scan-2026-04-20.md`
- `audits/supply-chain-audit-2026-04-20.md`
- `audits/cwe-mapping-2026-04-20.md`
- `audits/llm-compliance-report-2026-04-20.md`
- `audits/Dyscalculia-Compliance-Audit-retirement-dashboard-angular-2026-04-20.md`
- `audits/Dyslexia-Compliance-Audit-retirement-dashboard-angular-2026-04-20.md`
- `audits/contribution-analysis-2026-04-20.md`

Current posture: 0 CRITICAL, 0 HIGH, 0 MEDIUM app-source findings; 4 LOW
+ 3 INFO hardening items tracked; 3 HIGH dev-dep CVEs accepted until the
next Angular major upgrade.

---

## Contacts

- Security lead: **justice8096+security@gmail.com**
- Paired backend security policy:
  [retirement-api/SECURITY.md](https://github.com/justice8096/retirement-api/blob/master/SECURITY.md)
