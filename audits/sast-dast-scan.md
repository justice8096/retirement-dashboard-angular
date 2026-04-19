# SAST/DAST Scan Report
## retirement-dashboard-angular

| Field | Value |
|-------|-------|
| **Project** | retirement-dashboard-angular |
| **Scan Date** | 2026-04-19 |
| **Scanner** | Manual SAST sweep (ripgrep patterns) + `npm audit` |
| **Commit** | 86e7fd7 |
| **Branch** | feature/aca-cliff-tax-service-refactor |
| **Scope** | `src/app/**/*.ts`, component inline templates, `src/index.html`, `src/environments/**`, `src/styles.scss`, `angular.json`, `tsconfig*.json` |
| **Files Scanned** | 75 TypeScript files (~10,500 LOC app code), 1 root HTML, 2 environment files |
| **Type** | Initial scan — no prior full SAST audit exists |

---

## Executive Summary

The Angular 19 frontend is a **standalone-components + signals SPA** that consumes a backend REST API (base URL injected via `environment.apiBaseUrl`). It does **not** embed any authentication logic, does not construct SQL / shell / XML / template strings from user data, does not deserialize binary blobs, and does not use `eval`, dynamic-constructor invocation, `innerHTML`, `[innerHTML]`, or `DomSanitizer.bypassSecurityTrust*`. Angular's default context-aware output escaping is relied on throughout, which is the correct posture for a template-bound SPA.

The scan surfaced **0 critical, 2 medium, 4 low, 3 info** findings — all are hardening opportunities, none represent exploitable vulnerabilities in the frontend code itself. The only HIGH-severity items come from the supply chain (documented separately in `supply-chain-audit.md`) — the app source code is clean.

| Severity | Count | Headline |
|----------|:-----:|----------|
| CRITICAL | 0 | — |
| HIGH | 0 | — |
| MEDIUM | 2 | Reverse tabnabbing on user-controlled external links; missing Content-Security-Policy |
| LOW | 4 | SRI missing on CDN font CSS, unthrottled `localStorage` writes, `window.open` of blob URL without sandbox, no HTTP response-shape validation |
| INFO | 3 | Production API base URL is same-origin `/api` (good), no auth interceptor present (by design — backend owns session), `console.warn` on failed fetches leaks endpoint shapes to browser console |

---

## MEDIUM Findings

### M-01 — Reverse tabnabbing: user-controlled external links open in new tab without `rel="noopener noreferrer"`

- **CWE**: [CWE-1022 — Use of Web Link to Untrusted Target with window.opener Access](https://cwe.mitre.org/data/definitions/1022.html)
- **OWASP**: A05:2021 — Security Misconfiguration
- **CVSS v3.1**: 4.3 (AV:N / AC:L / PR:N / UI:R / S:U / C:N / I:L / A:N) — Medium

**Affected files / lines:**

| File | Line | Snippet |
|------|-----:|---------|
| `src/app/components/screens/localinfo-screen/localinfo-screen.component.ts` | 101 | `<a [href]="link.url" target="_blank" class="ext-link">` |
| `src/app/components/screens/localinfo-screen/localinfo-screen.component.ts` | 109 | `<a [href]="link.url" target="_blank" class="ext-link">` |
| `src/app/components/screens/localinfo-screen/localinfo-screen.component.ts` | 117 | `<a [href]="link.url" target="_blank" class="ext-link">` |
| `src/app/components/screens/localinfo-screen/localinfo-screen.component.ts` | 125 | `<a [href]="link.url" target="_blank" class="ext-link">` |
| `src/app/components/screens/services-screen/services-screen.component.ts` | 62 | `<a [href]="src.url" target="_blank" class="src-link">` |

**Evidence:**
```html
<a [href]="link.url" target="_blank" class="ext-link">{{ link.title }}</a>
```

The `link.url` values come from the `/locations/{id}/{dataType}` supplement feed (webcams, YouTube, blogs, official sites, medical-service sources). Because the content is author-curated but served from a backend database that may accept admin/contribution input, a hostile URL could point at an attacker-controlled page that manipulates the opener via `window.opener.location` (reverse tabnabbing) and phishes the user.

**Remediation:**
```html
<a [href]="link.url" target="_blank" rel="noopener noreferrer" class="ext-link">{{ link.title }}</a>
```
The `assumptions-screen.component.ts:417` link to healthcare.gov already uses `rel="noopener"` — apply the same pattern to all five dynamic-href locations, preferring `rel="noopener noreferrer"` (noreferrer also suppresses the `Referer` header, protecting the app's URL structure from being leaked). Effort: ~5 min.

---

### M-02 — No Content-Security-Policy (CSP) configured for the app shell

- **CWE**: [CWE-693 — Protection Mechanism Failure](https://cwe.mitre.org/data/definitions/693.html), [CWE-1021 — Improper Restriction of Rendered UI Layers or Frames](https://cwe.mitre.org/data/definitions/1021.html)
- **OWASP**: A05:2021 — Security Misconfiguration
- **CVSS v3.1**: 5.4 (AV:N / AC:L / PR:N / UI:R / S:U / C:L / I:L / A:N) — Medium

**Evidence:**
- `src/index.html` contains no `<meta http-equiv="Content-Security-Policy" …>` directive.
- No HTTP-header CSP is served — Angular's `@angular/build` application builder does not inject one, and there is no reverse-proxy / CDN config in-repo (the build output is static files served under `/`).
- No X-Frame-Options equivalent is set via meta either (`frame-ancestors` in CSP is the modern equivalent).

**Impact:** If any future regression or supply-chain compromise introduces inline-script injection (e.g., via a compromised Material Design or Leaflet transitive), there is no policy to block it. CSP is defense-in-depth for an SPA that already loads external fonts from two third-party CDNs (Google Fonts, jsDelivr).

**Remediation:** Either add a CSP header at the hosting layer (preferred) or add a meta tag to `src/index.html`. Minimum viable policy for this app:

```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net;
  font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net;
  img-src 'self' data: blob: https://*.openstreetmap.org https://*.basemaps.cartocdn.com;
  connect-src 'self';
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self';
  object-src 'none';
">
```

Note: Angular templates use `style` attributes from computed bindings (`[style.width.%]`, etc.), so `style-src 'unsafe-inline'` is required unless you move to CSP nonces — which Angular 19 does not yet support on style attributes. Script-src can stay strict. Effort: ~15 min + staging test pass.

---

## LOW Findings

### L-01 — No Subresource Integrity (SRI) on CDN font stylesheets

- **CWE**: [CWE-353 — Missing Support for Integrity Check](https://cwe.mitre.org/data/definitions/353.html)
- **File**: `src/index.html:11,13`

The app loads `fonts.googleapis.com/css2?family=…` and `cdn.jsdelivr.net/npm/@fontsource/opendyslexic@5.1.0/400.css` without `integrity=` hashes. If either CDN is compromised (or a DNS takeover happens), arbitrary CSS is served. CSS injection is lower-impact than script injection but can still be used for data exfiltration via `url(…)` attribute selectors.

Google Fonts stylesheets contain dynamic `@font-face` blocks and cannot be SRI-pinned (contents change with viewport/unicode-range negotiation). The jsDelivr stylesheet, however, is versioned and could be pinned:

```html
<link href="https://cdn.jsdelivr.net/npm/@fontsource/opendyslexic@5.1.0/400.css"
      integrity="sha384-<computed>" crossorigin="anonymous" rel="stylesheet">
```

Effort: ~10 min. Recommended post-CSP work.

---

### L-02 — Unthrottled `localStorage.setItem` on every signal update

- **CWE**: [CWE-400 — Uncontrolled Resource Consumption](https://cwe.mitre.org/data/definitions/400.html) (minor DoS surface)
- **Files**: `src/app/services/dyslexia.service.ts:122-128`, `src/app/services/dyscalculia.service.ts:201-207`

`persist()` is called synchronously inside every `update()` call. If a settings panel drives a rapid `update()` stream (e.g. a slider), every frame writes the full JSON blob to `localStorage`. This is not a security hole — more of a perf smell — but a hostile component with write access to the signal could fill the ~5 MB origin quota, causing a `QuotaExceededError` that is swallowed by the empty `catch {}`.

**Remediation:** Wrap `persist` in a `requestIdleCallback` or 150 ms debounce. Effort: ~10 min.

---

### L-03 — `window.open(url, '_blank', …)` on a blob URL in brochure print flow

- **CWE**: [CWE-601 — URL Redirection to Untrusted Site](https://cwe.mitre.org/data/definitions/601.html) (marginal — blob is same-origin)
- **File**: `src/app/components/screens/brochure-screen/brochure-screen.component.ts:178-186`

The brochure template HTML is built via string interpolation with a correct `esc()` helper that escapes `& < > " '` for every user-controlled string (`loc.name`, `loc.country`, `loc.region`, `loc.currency`, `cat.label`, pros, cons). This is safe — I verified every interpolation point goes through `esc()`. The only residual concern is that the blob is opened without `rel="noopener"` equivalent (irrelevant for `window.open` — the opened window can always access `window.opener` unless the second arg includes `noopener`). Recommended:

```ts
const win = window.open(url, '_blank', 'width=800,height=1000,noopener,noreferrer');
```

Note: with `noopener`, you cannot `win.focus()` or `win.print()` — so the current flow is incompatible. Alternative: use an iframe in a modal for the print preview, or use the native `window.print()` on a hidden iframe whose `srcdoc` is the HTML. Effort: ~30 min if you want to remove the popup entirely.

---

### L-04 — No HTTP response-shape validation

- **CWE**: [CWE-20 — Improper Input Validation](https://cwe.mitre.org/data/definitions/20.html)
- **File**: `src/app/services/api.service.ts` (all methods)

Every `this.http.get<T>(…)` uses the TypeScript generic as a pure type assertion — no runtime Zod/io-ts/class-validator schema is applied. If the backend regresses and returns a malformed payload (e.g., a number where an object is expected), the UI crashes downstream with an opaque "cannot read property X of undefined" in `console`. This is not a vulnerability per se (same-origin trusted API), but it degrades Incident Response posture. Future work: adopt `zod` or a Valibot-style parser for the `LocationFull`, `Scenario`, and `FinancialSettings` shapes.

---

## INFO Findings

### I-01 — Production API base URL is relative `/api` (good)

`src/environments/environment.prod.ts` uses `apiBaseUrl: '/api'` — same-origin, so CSRF protection reduces to whatever SameSite/CORS posture the backend uses. Development uses `http://localhost:3000/api`, correctly isolated to the `environment.ts` file.

### I-02 — No auth interceptor present (by design)

`src/app/app.config.ts` registers `provideHttpClient(withFetch())` with no interceptors. No tokens, no `Authorization` header handling, no CSRF token logic is present in the frontend. This is consistent with a cookie-based session owned by the backend — verify backend sets `Secure; HttpOnly; SameSite=Lax` (or Strict) cookies. If the backend moves to JWT-in-header in future, an interceptor will need to be added and audited for token storage (never in `localStorage`).

### I-03 — `console.warn` on error paths leaks endpoint shapes

`LocationService` logs to `console.warn` on fetch failures (lines 148, 233, 240, 247 of `location.service.ts`). This is benign for a development build but leaks endpoint shape / error text to the browser console in production. Consider a toggle on `environment.production` to suppress or route to a telemetry sink.

---

## DAST / Runtime Surface (Out-of-Scope but Noted)

A true DAST run (OWASP ZAP / Burp active scan) was **not** performed — it requires a running backend and seeded user. Recommended next steps when a staging backend exists:

1. Run ZAP baseline scan against staging (unauthenticated + authenticated).
2. Verify SameSite and Secure cookie flags at the backend.
3. Verify that `/api/me/*` endpoints require auth and reject cross-origin preflight without credentials.
4. Fuzz `GET /api/locations?search=<payload>` with XSS/SQLi strings — any reflection would show up in the returned `LocationSummary.name` and pass through Angular escaping safely, but that's a backend concern.

Items 2–4 are backend responsibilities; only item 1 exercises the frontend shell.

---

## Scan Methodology

Ripgrep searches covered:

- Dynamic-code sinks: `eval\(`, dynamic-function constructor patterns
- DOM injection: `innerHTML`, `[innerHTML]`, `bypassSecurityTrust`, `DomSanitizer`, legacy DOM write calls, cookie reads
- Redirection / popup: `window.open`, `[src]`, `[href]`, `target="_blank"`, `rel=`
- Storage: `localStorage|sessionStorage`, `JSON.parse`
- Crypto / randomness: `Math.random`, `crypto\.`
- Secrets: `password|secret|api_key|token|bearer\s*[:=]\s*['"]`
- Network: `HttpClient|fetch\(|XMLHttpRequest`, non-local HTTP URLs
- Auth: `auth|Authorization|Bearer|cookie|withCredentials`
- Policy: `Content-Security-Policy`, `integrity=`
- Perf hygiene: `trackBy`

Plus `npm audit --json` for dependency CVEs (detailed in `supply-chain-audit.md`).

Manual review of `api.service.ts` (30 endpoints), `app.config.ts`, `index.html`, `environment*.ts`, `brochure-screen.component.ts` (only component that builds raw HTML strings), `dyslexia.service.ts` + `dyscalculia.service.ts` (only services touching `localStorage`).

---

## Remediation Priority

1. **M-01** (reverse tabnabbing) — 5 min, high-value, low-risk. Do first.
2. **M-02** (CSP) — ~15 min + staging regression test. Tackle in a dedicated hardening branch.
3. **L-02** (debounce localStorage) — 10 min polish.
4. **L-01** / **L-03** / **L-04** — opportunistic.
5. **I-03** — consider on the next telemetry/logging pass.

No critical or high frontend findings — the app is safe to continue feature work in parallel with hardening.
