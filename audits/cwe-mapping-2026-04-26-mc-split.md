# CWE Mapping & Compliance Cross-Walk — retirement-dashboard-angular (MC split batch)

| Field | Value |
|---|---|
| **Date** | 2026-04-26 (batch 2) |
| **Commit** | `44c6424` (main) |
| **Source audit** | `sast-dast-scan-2026-04-26-mc-split.md` |
| **Findings in scope** | 2 LOW (carried forward, same CWE), 4 INFO (positive controls; unchanged) |
| **Previous mapping** | `cwe-mapping-2026-04-26.md` |

---

## Summary

This audit period (4 PRs since the prior 2026-04-26 baseline) introduced **zero new CWEs**. The 2 active LOW findings remain the same CWE-502 localStorage-parse pattern in `dyslexia.service.ts` and `dyscalculia.service.ts` carried forward from the 2026-04-19 baseline. No regressions, no new exposures.

The batch is a structural refactor with no new code in the security-relevant sense — the only `+` line hits in the SAST sweep are file-level moves of pre-existing code (notably the MC `window.open(...,'noopener,noreferrer')` call moving from the parent component to `mc-results.component.ts` with security flags intact).

---

## Per-finding mapping (active CWEs)

### CWE-502 — Deserialization of Untrusted Data

Unchanged from `cwe-mapping-2026-04-26.md`. Same call sites:

- `src/app/services/dyslexia.service.ts:86–89`
- `src/app/services/dyscalculia.service.ts:308–311`

Both wrapped in try/catch with safe fallback defaults; blast radius confined to the user's own browser; mitigated by the same recommended fix (shared schema validator).

Full 8-framework mapping is preserved verbatim from the prior cycle's doc.

---

## Carried-forward CWEs (closed prior, no regression)

All previously-closed CWEs re-verified clean against the 4-PR diff:

| CWE | Closed in | Re-verified this audit |
|---|---|---|
| CWE-79 (XSS via raw HTML/SVG sinks) | 2026-04-19 (text-escape.ts shared lib) | YES — diff sweep confirms no new innerHTML / sanitizer-bypass / DomSanitizer escapes |
| CWE-94 (code-execution sinks) | 2026-04-19 (zero eval / function-constructor / string-bodied timers in src) | YES — confirmed via batch diff sweep |
| CWE-1022 (insecure `window.open` without `noopener`) | 2026-04-19 (all `window.open` audited) | YES — the single `window.open` site moved from parent to `mc-results.component.ts`; `noopener,noreferrer` flags preserved verbatim |
| CWE-330 (insufficient randomness for security purposes) | 2026-04-19 (`Math.random` is statistical-only; UUIDs use `crypto.randomUUID`) | YES — no new `Math.random` sites in the batch (the 2 added in 2026-04-26 batch 1 are unchanged) |
| CWE-798 (hardcoded credentials in source) | 2026-04-19 (no secrets in `src/environments/*`) | YES — confirmed via batch diff sweep |

---

## Compliance posture by framework (unchanged from prior cycle)

The compliance snapshot from `cwe-mapping-2026-04-26.md` is fully preserved — no new framework triggers, no new incident-reporting thresholds met. CWE-502 remains the single open hardening opportunity, not an exposure.

---

## Verdict

**Posture unchanged.** No new CWEs, no regressions, no new framework triggers. The 4-PR refactor batch is materially neutral from a compliance perspective — it improves code organization without affecting the security or compliance surface.
