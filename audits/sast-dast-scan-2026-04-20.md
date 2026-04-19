# SAST/DAST Scan Report
## retirement-dashboard-angular

| Field | Value |
|-------|-------|
| **Project** | retirement-dashboard-angular |
| **Scan Date** | 2026-04-20 |
| **Scanner** | Manual SAST sweep (ripgrep patterns) + `npm audit` |
| **Commit** | cf2ed63 |
| **Branch** | feature/audit-fixes-high-medium |
| **Scope** | `src/app/**/*.ts`, component inline templates, `src/index.html`, `src/environments/**`, `src/styles.scss`, `angular.json`, `tsconfig*.json` |
| **Files Scanned** | 75 TypeScript files (~10,500 LOC app code), 1 root HTML, 2 environment files |
| **Type** | Follow-up — supersedes `audits/sast-dast-scan.md` (2026-04-19) |

---

## Executive Summary

This scan re-runs the SAST/DAST pass that produced the 2026-04-19 baseline and validates the remediation landed on `feature/audit-fixes-high-medium`. Both MEDIUM findings from the prior report (**M-01 reverse tabnabbing**, **M-02 missing CSP**) have been closed with targeted, minimal changes. Four LOW and three INFO items remain open and are carried forward unchanged — none blocks feature work.

No new LOW/INFO findings were introduced by intervening feature work: voice entry in `NumericInputDirective` is gated behind a dyscalculia setting and uses only the Web Speech API (no `eval`, no DOM write, no network egress beyond the browser's speech pipeline), `ConcreteTilesComponent` is pure presentation, calm Monte-Carlo mode is UI gating only, and the readability tooling is a Node-only script that is not part of the `ng build` output bundle.

The Angular 19 frontend continues to rely on the framework's default context-aware output escaping — no `eval`, no dynamic-function constructors, no `innerHTML` / `[innerHTML]`, no `DomSanitizer.bypassSecurityTrust*`, and no hardcoded credentials were found.

| Severity | Count (prior → now) | Delta |
|----------|:-------------------:|:-----:|
| CRITICAL | 0 → 0 | — |
| HIGH | 0 → 0 | — |
| MEDIUM | 2 → 0 | -2 (both closed) |
| LOW | 4 → 4 | 0 |
| INFO | 3 → 3 | 0 |

---

## Delta vs. 2026-04-19

| ID | Title | Prior | Now | Evidence |
|----|-------|:-----:|:---:|----------|
| M-01 | Reverse tabnabbing on 5 external links | MEDIUM (open) | **FIXED** | `rel="noopener noreferrer"` present on all 5 dynamic `target="_blank"` anchors (see below) |
| M-02 | No Content-Security-Policy | MEDIUM (open) | **FIXED** | CSP meta tag present at `src/index.html:8` with the recommended directive set |
| L-01 | SRI on CDN fonts | LOW (open) | LOW (open) | No `integrity=` on `src/index.html` CDN links |
| L-02 | Unthrottled `localStorage.setItem` | LOW (open) | LOW (open) | No debounce added to `dyslexia.service.ts` / `dyscalculia.service.ts` persist paths |
| L-03 | `window.open` in brochure print | LOW (open) | LOW (open) | `brochure-screen.component.ts:179` still `window.open(url, '_blank', 'width=800,height=1000')` |
| L-04 | No HTTP response-shape validation | LOW (open) | LOW (open) | `api.service.ts` still uses TS generics as type assertions |
| I-01 | Prod API base URL is `/api` (good) | INFO | INFO | unchanged |
| I-02 | No auth interceptor (by design) | INFO | INFO | unchanged |
| I-03 | `console.warn` leaks endpoint shapes | INFO (open) | INFO (open) | `location.service.ts` log lines unchanged |

---

## Verification of Closed Findings

### M-01 — Reverse tabnabbing — CLOSED

All five dynamic external-link anchors now carry `rel="noopener noreferrer"`. Every `target="_blank"` in the app source is paired with `rel` (verified by the full-tree grep below — six total hits, six with `rel="noopener noreferrer"`).

**Ripgrep evidence** (pattern: `target="_blank"` across `src/app/components/screens/localinfo-screen/` and `services-screen/`):

```
src/app/components/screens/localinfo-screen/localinfo-screen.component.ts:101:  <a [href]="link.url" target="_blank" rel="noopener noreferrer" class="ext-link">{{ link.title }}</a>
src/app/components/screens/localinfo-screen/localinfo-screen.component.ts:109:  <a [href]="link.url" target="_blank" rel="noopener noreferrer" class="ext-link">{{ link.title }}</a>
src/app/components/screens/localinfo-screen/localinfo-screen.component.ts:117:  <a [href]="link.url" target="_blank" rel="noopener noreferrer" class="ext-link">{{ link.title }}</a>
src/app/components/screens/localinfo-screen/localinfo-screen.component.ts:125:  <a [href]="link.url" target="_blank" rel="noopener noreferrer" class="ext-link">{{ link.title }}</a>
src/app/components/screens/services-screen/services-screen.component.ts:62:    <a [href]="src.url" target="_blank" rel="noopener noreferrer" class="src-link">{{ src.title }}</a>
```

The pre-existing `assumptions-screen.component.ts:426` healthcare.gov link also carries `rel="noopener noreferrer"`, so no `target="_blank"` anchor is now missing the opener guard.

### M-02 — Missing Content-Security-Policy — CLOSED

A CSP meta directive has been added to `src/index.html:8` with the exact policy recommended in the prior report:

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net;
font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net;
img-src 'self' data: blob: https://*.openstreetmap.org https://*.basemaps.cartocdn.com;
connect-src 'self';
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
object-src 'none'
```

Notes for reviewers:
- `script-src 'self'` is strict — no inline scripts, no third-party CDNs. This is compatible with the current `ng build` output.
- `style-src 'unsafe-inline'` remains necessary because Angular's attribute-style bindings (`[style.width.%]`, etc.) emit inline `style=` attributes.
- `frame-ancestors 'none'` provides the X-Frame-Options equivalent.
- A CSP *header* at the hosting/CDN layer is still the preferred long-term posture (a meta tag cannot express `frame-ancestors` to every user-agent reliably, and reporting endpoints cannot be set from meta); the meta tag is a correct shippable baseline until the hosting layer is ready.

---

## Open Findings (Carried Forward Unchanged)

The following items remain as documented in `audits/sast-dast-scan.md`. Summaries below; see the prior report for full CWE/CVSS/remediation detail.

### LOW

- **L-01** — No SRI hashes on CDN font stylesheets at `src/index.html:11,13`. jsDelivr `@fontsource/opendyslexic@5.1.0/400.css` is pinnable; Google Fonts CSS is not (dynamic `@font-face` negotiation). Effort ~10 min for the pinnable one.
- **L-02** — `persist()` writes `localStorage` on every signal update in `dyslexia.service.ts:122-128` and `dyscalculia.service.ts:201-207`. Perf smell with a minor DoS surface via swallowed `QuotaExceededError`. Wrap in 150 ms debounce or `requestIdleCallback`.
- **L-03** — Brochure print flow uses `window.open(url, '_blank', 'width=800,height=1000')` at `brochure-screen.component.ts:179`. The blob is same-origin and all interpolation passes through `esc()`; residual issue is the popup's `window.opener` reference. Adding `noopener,noreferrer` breaks `win.focus()` / `win.print()`, so proper remediation is an iframe-based print flow (~30 min).
- **L-04** — `api.service.ts` uses TypeScript generics as runtime-free type assertions. Backend regressions will surface as opaque `cannot read property of undefined` errors. Adopt `zod` / Valibot for `LocationFull`, `Scenario`, `FinancialSettings`.

### INFO

- **I-01** — Prod `apiBaseUrl: '/api'` (same-origin). Good posture; cross-origin CSRF reduces to backend SameSite/CORS hygiene.
- **I-02** — No HTTP interceptors registered in `app.config.ts`. Correct for a cookie-based session owned by the backend. Revisit if the backend moves to JWT-in-header.
- **I-03** — `LocationService` logs endpoint shapes on failure via `console.warn` in production builds. Benign, but consider gating on `environment.production` or routing to a telemetry sink.

---

## New-Surface Re-Scan (since 2026-04-19)

Verified that no new security-relevant sinks were introduced:

| Pattern | Hits | Notes |
|---------|:----:|-------|
| `eval\(` | 0 | none in app source |
| `innerHTML` | 0 | none |
| `\[innerHTML\]` | 0 | none |
| `bypassSecurityTrust` | 0 | none |
| `(password\|secret\|api_key\|apiKey\|bearer\|token)\s*[:=]\s*['"]` (case-insensitive) | 0 | no hardcoded credentials |
| `window\.open` | 1 | only the pre-existing brochure print path (L-03) |
| `target="_blank"` | 6 | all paired with `rel="noopener noreferrer"` |

Newer feature areas audited and cleared:

- **`NumericInputDirective` voice entry** — uses `webkitSpeechRecognition` / `SpeechRecognition` APIs only when the dyscalculia "voice entry" setting is enabled. Recognised text is parsed with a numeric regex before being written to the bound control — no DOM write, no `eval`, no network request from app code.
- **`ConcreteTilesComponent`** — pure presentation, Angular-bound templates, no DOM API use.
- **Calm Monte-Carlo mode** — UI gating toggles (CSS classes + signal reads). No new data paths.
- **`tools/readability/*` / Node scripts** — outside the `ng build` bundle; not loaded by any browser runtime.

---

## DAST / Runtime Surface

Unchanged from 2026-04-19. A true DAST run (OWASP ZAP / Burp active scan) still requires a running staging backend with seeded users and is deferred. The addition of the CSP meta tag in this cycle means a ZAP baseline scan will now surface fewer "Missing Anti-CSP Header" warnings when staging is online.

---

## Scan Methodology

Identical to the 2026-04-19 report — ripgrep-driven pattern sweep across dynamic-code sinks, DOM injection, redirection / popup, storage, crypto, secrets, network, auth, and policy directives, plus `npm audit --json` for supply-chain CVEs (detailed in `audits/supply-chain-audit.md`).

The verification pass for this report added explicit `rel=` pairing confirmation on every `target="_blank"` anchor and a presence check for `<meta http-equiv="Content-Security-Policy">` in `src/index.html`.

---

## Remediation Priority (remaining)

1. **L-02** — debounce `localStorage` writes. 10 min, lowest-risk remaining item.
2. **L-01** — SRI on the jsDelivr opendyslexic stylesheet. 10 min.
3. **L-04** — runtime schema validation for `api.service.ts`. Half-day once a validator library is chosen; pair with a backend contract-test pass.
4. **L-03** — iframe-based brochure print. ~30 min; coordinate with any brochure UX refresh.
5. **I-03** — environment-gated logging. Fold into the next telemetry pass.

No MEDIUM, HIGH, or CRITICAL frontend findings remain. The `feature/audit-fixes-high-medium` branch is safe to merge from a SAST perspective.
