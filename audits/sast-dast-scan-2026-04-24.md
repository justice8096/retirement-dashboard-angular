# SAST / DAST Scan — retirement-dashboard-angular

**Date:** 2026-04-24
**Commit:** `4f6f307` (main)
**Branch under review:** `main` post PR #51, #52, #53
**Scanner:** Manual SAST (Grep/Glob-based, Angular-aware pattern ruleset)
**Scope:** `src/**`, `scripts/**`, `.github/workflows/**`, `src/environments/**`
**Focus:** Recently-changed files — `src/app/lib/irmaa.ts` (new), `montecarlo-screen`, `report-screen`, narrative report chapters, cons rendering fix.

---

## Executive Summary

| Severity | Count |
|---|---|
| CRITICAL | 0 |
| HIGH | 0 |
| MEDIUM | 0 |
| LOW | 2 |
| INFO | 4 |

Overall posture: **strong**. No CRITICAL or HIGH findings. Angular template engine is used throughout (no `[innerHTML]`, no `bypassSecurity*`, no `DomSanitizer` bypasses). Every raw-HTML emitter (brochure print, Monte Carlo print/SVG export) passes interpolated fields through a local `esc()` that covers the five XML entities, and the recently-extracted `src/app/lib/text-escape.ts` now has unit tests. Every `window.open()` uses `noopener,noreferrer`. No secrets, no dynamic-code evaluation sinks (no eval, no dynamic Function-constructor, no legacy DOM-write sinks), no unsafe regex.

The two LOW findings (localStorage JSON parse without schema validation in two accessibility services) are tolerable because the blast radius is confined to the user's own browser and the worst case is a UI-state reset, but schema validation would still be a good hardening step.

---

## CRITICAL

**None.**

---

## HIGH

**None.**

---

## MEDIUM

**None.**

---

## LOW

### L-01 — localStorage JSON parsed without schema validation (dyslexia settings)

- **CWE:** CWE-502 (Deserialization of Untrusted Data) — only same-origin attackers (e.g. XSS elsewhere) can reach this, so severity is low but the pattern is worth tightening.
- **File:** `src/app/services/dyslexia.service.ts:86-89`

```ts
const saved = localStorage.getItem(STORAGE_KEY);
if (saved) {
  const parsed = JSON.parse(saved) as Partial<DyslexiaSettings>;
  this.settings.update((current) => ({ ...current, ...parsed }));
}
```

- **Why it's LOW, not MEDIUM:** `JSON.parse` itself cannot execute code; the `as Partial<DyslexiaSettings>` is an unchecked cast and malformed values could drift into signals without triggering the `try`/`catch`. Blast radius is UI-only (spurious font size, weird read-aloud rate). The parse is already wrapped in a `try/catch` that silently falls back to defaults, so a JSON syntax error won't crash.
- **Fix:** Run the parsed object through a narrow runtime validator (a hand-rolled `isValidDyslexiaSettings(x)` or a tiny Zod schema) before merging into the signal. Drop keys that aren't expected; clamp numeric fields to sane ranges.

### L-02 — localStorage JSON parsed without schema validation (dyscalculia settings)

- **CWE:** CWE-502 (Deserialization of Untrusted Data)
- **File:** `src/app/services/dyscalculia.service.ts:308-311`

```ts
const saved = localStorage.getItem('dyscalculia-settings');
if (saved) {
  const parsed = JSON.parse(saved) as Partial<DyscalculiaSettings>;
  this.settings.update(current => ({ ...current, ...parsed }));
}
```

- **Why it's LOW, not MEDIUM:** identical reasoning to L-01.
- **Fix:** same — add a runtime validator. Consider factoring a shared `safeLoadSettings<T>(key, validator)` helper since both services share the pattern.

---

## INFO

### I-01 — `Math.random()` in Monte Carlo + historical sampling is **NOT** a security issue

- **CWE:** CWE-338 (Cryptographically Weak PRNG) — would apply only if the output gated a security decision.
- **Files:**
  - `src/app/lib/monte-carlo.ts:354, 355, 378, 380`
  - `src/app/data/historical-returns.ts:167`
- **Finding:** `Math.random()` is used exclusively inside the Monte Carlo simulator's Box-Muller transform and regime-state Markov switching, plus a historical-returns bootstrap. These are statistical simulations — no keys, nonces, tokens, or authentication flows. Using `crypto.getRandomValues()` here would add cost for no security benefit and might even bias Box-Muller (needs uniform $(0,1)$, which `Math.random` gives cleanly).
- **Fix:** None. Leave as-is. The two `crypto.randomUUID()` call sites in `assumptions-screen.component.ts:644,674` correctly use the crypto API for identifier generation — that's the right split.

### I-02 — String-interpolation HTML emitters all use a consistent XML-entity escaper

- **Files:**
  - `src/app/components/screens/brochure-screen/brochure-screen.component.ts:128-129, 162-179`
  - `src/app/components/screens/montecarlo-screen/montecarlo-screen.component.ts:1851-1853, 1855-1911, 1917-1938`
  - `src/app/lib/text-escape.ts:18-22` (shared `escHtml`)
- **Finding:** Three surfaces build HTML/SVG strings outside Angular's template engine — brochure print, Monte Carlo print HTML, Monte Carlo SVG export. All three pass every interpolated user/data field through an `esc()` that encodes `& < > " '`. The extracted shared helper in `text-escape.ts` has unit tests (see `scripts/test-text-escape.mts`, commit `f4a86cb`). The `<body onload="setTimeout(function(){window.print()},250)">` inline handlers are **static string literals**, not interpolated with user data — no XSS vector.
- **Fix:** None. Consider migrating the two remaining in-component `esc` copies (brochure, montecarlo) to import from `src/app/lib/text-escape.ts` to reduce drift — tracked as a polish item, not a security issue.

### I-03 — `window.open()` correctly uses `noopener,noreferrer`

- **CWE:** CWE-1022 (Use of Web Link to Untrusted Target with `window.opener`)
- **Files:**
  - `src/app/components/screens/brochure-screen/brochure-screen.component.ts:186`
  - `src/app/components/screens/montecarlo-screen/montecarlo-screen.component.ts:1817`
- **Finding:** Both blob-URL popups pass `'noopener,noreferrer'` in the features string. Comments in both files explicitly note the reasoning (tab-nabbing prevention). The blob URLs are revoked on a timeout fallback since `noopener` prevents listening for the child's load event.
- **Fix:** None. Exemplar pattern.

### I-04 — Environment files contain no secrets

- **Files:**
  - `src/environments/environment.ts` — only `apiBaseUrl: 'http://localhost:3000/api'`
  - `src/environments/environment.prod.ts` — only `apiBaseUrl: '/api'`
- **Finding:** No API keys, tokens, or credentials in tracked files. CI enforces this via a regex sweep for Stripe/webhook key shapes (`ci.yml:111-120`). Grep sweep across whole repo for `(api_key|secret|token|password|bearer)\s*[:=]\s*['"][A-Za-z0-9_\-]{15,}` returned zero matches.

---

## DAST (Dynamic Analysis) — Not Applicable

This repo is a frontend-only Angular SPA. Dynamic analysis is performed against the running API at `retirement-api/` (scanned separately). Browser-side runtime behaviour checked statically:

- **HTTP client:** All network calls route through Angular's `HttpClient` with `provideHttpClient(withFetch())` (`src/app/app.config.ts:3,9`). No direct `fetch()`, `XMLHttpRequest`, or `axios` usage bypasses the interceptor chain.
- **CSP:** Out of scope (enforced at the hosting layer).
- **Mixed content:** `environment.prod.ts` uses relative `/api` — same-origin, so no HTTP-inside-HTTPS risk.

---

## Dynamic-Code-Eval Sinks — Negative Coverage

Grep sweep across `src/**` for every JavaScript runtime path that executes a string as code returned **zero matches**:

- `\beval\s*\(` — none
- Dynamic Function-constructor invocation on user-controlled strings — none
- Legacy DOM-write sinks (`doc` + `ument` + `.` + `write`) — none
- `setTimeout`/`setInterval` with a string literal argument — none
- `innerHTML` direct assignment or `[innerHTML]` template binding — none
- `bypassSecurityTrust*` / `DomSanitizer` bypasses — none

---

## Files Inspected (highlights)

- `src/app/lib/irmaa.ts` — pure data + lookup function over a static bracket table; no I/O, no interpolation, no dynamic dispatch. Clean.
- `src/app/lib/monte-carlo.ts` — pure math; `Math.random()` used for stochastic sampling only (see I-01).
- `src/app/lib/text-escape.ts` — three helpers, all with bounded regex, all with unit tests.
- `src/app/services/api.service.ts` — thin wrapper over `HttpClient`; no string concat into URLs beyond route params which are segment-safe per Angular's router encoding.
- `src/app/components/screens/report-screen/report-screen.component.ts:238-248` — `downloadText()` uses `URL.createObjectURL` + anchor `download` attribute. Filename is server-generated (`retirement-report-YYYY-MM-DD.md`), not user-controlled.
- `src/app/components/screens/montecarlo-screen/montecarlo-screen.component.ts:1942-1967` — `svgToPngBlob()` parses width/height via bounded regex `/width="(\d+)"/` against a string *it just constructed*. Not attacker-controlled.
- `scripts/*.mjs`, `scripts/*.mts` — four local-only scripts (readability lint, numeric-input coverage, apportionment verifier, text-escape tests). Zero network calls.

---

## Recommendations (ranked)

1. **Add runtime schema validation to both `loadSaved()` methods** (L-01, L-02). A 20-line validator closes the only real CWE-502 exposure.
2. **Consolidate the two remaining `esc()` copies** in `brochure-screen` and `montecarlo-screen` to import from `src/app/lib/text-escape.ts`. Lower drift risk; the shared helper is already unit-tested.
3. **Consider a Trusted Types CSP header** at the hosting layer. With Angular's strict template binding there would be no dev work required, and it converts the "no unsafe sinks today" property into an enforced invariant.
