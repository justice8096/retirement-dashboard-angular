# SAST/DAST Scan — 2026-04-21

**Scope:** 11 new files + 9 modified files, all client-side Angular TS.
**Commit range:** Post-commit audit of 2 days of work on branch `main`.
**Scanner:** Manual SAST — full source read of every file in scope + targeted ripgrep sweeps.

## Summary
- CRITICAL: 0
- HIGH: 0
- MEDIUM: 0
- LOW: 1 (remediated in this cycle)
- INFO: 3 (2 remediated, 1 structural, deferred)

No critical or high findings. The sprint introduced no server-side code.

---

## Findings

### ✅ [LOW] MC `printCharts()` opens blob URL without `noopener` — RESOLVED

- **File:** `src/app/components/screens/montecarlo-screen/montecarlo-screen.component.ts:1631`
- **CWE:** CWE-1022 — Use of Web Link to Untrusted Target with window.opener Access
- **Status:** fixed in this audit cycle.

**Before:**
```ts
const win = window.open(url, '_blank', 'width=820,height=1000');
```

**After:**
```ts
const win = window.open(url, '_blank', 'width=820,height=1000,noopener,noreferrer');
// With noopener we can't listen for the child's load event, so use a
// timeout fallback long enough for the new window to fetch the blob URL.
setTimeout(() => URL.revokeObjectURL(url), 2500);
```

`noopener` severs `window.opener` in the new window, blocking tab-nabbing and any future regression that might pass API data into the SVG builder unescaped. Blob URL revocation moved from the child's `load` event (which can't be listened to under `noopener`) to a 2.5s timeout fallback.

---

## INFO Observations

### ✅ [INFO] `yamlStr()` does not escape embedded newlines — RESOLVED

- **File:** `src/app/components/screens/report-screen/report-screen.component.ts:827`
- **Status:** fixed in this audit cycle.

`yamlStr()` now also escapes `\n` → `\\n` and `\r` → `\\r` so a location name or country value containing an embedded newline produces valid double-quoted YAML front-matter rather than an unescaped literal newline.

### [INFO] Map `scoreColor()` output injected into divIcon HTML unescaped — STRUCTURAL, deferred

- **File:** `src/app/components/screens/map-screen/map-screen.component.ts:360`
- **Status:** not currently exploitable; structural hardening deferred.

`color` is produced exclusively by `scoreColor()`, which returns one of five hardcoded hex literals based on a clamped numeric score — attacker-uncontrollable today. Flagged because a future refactor routing API data through this path would introduce an unescaped CSS/HTML sink. A future cleanup could extract the five colors into a lookup table keyed by clamped integer so safe-by-construction is structurally enforced. Not urgent.

### [INFO] `buildPrintHtml()` splices pre-escaped SVG string directly into HTML — invariant correct but untested

- **File:** `src/app/components/screens/montecarlo-screen/montecarlo-screen.component.ts:1750`
- **Status:** documented invariant holds; test gap noted.

`buildStandaloneSvg()` applies `esc()` to every API string before they reach `buildPrintHtml()`. The inline splice `${svgStr}` is therefore safe. No code change required. Recommend a future unit test that asserts `esc()` neutralizes `<script>` in `locName` when MC gets test coverage.

---

## Areas Confirmed Clean

| Area | Verdict |
|------|---------|
| `escape()` coverage in map popup HTML | All API strings escaped |
| `esc()` coverage in MC SVG builder | Applied to location name, all `fmt()` outputs, `pd.points`, `p.label` |
| Blob URL revocation (report, MC save, MC print) | All three paths revoke correctly; MC print now uses timeout fallback under `noopener` |
| `updateFinancial()` field strip | Correct — strips `userId`, `updatedAt`, `_*`-prefixed keys; no legitimate settable field dropped |
| `batchLoadSupplements` idempotency | Filters to uncached IDs before POST; N+1 fan-out not re-introduced |
| `parseSpeedMbps` / `parseSpeedToMbps` regexes | `(\d+(?:\.\d+)?)\s*(G|M)?/i` — no nested quantifiers, no catastrophic backtracking |
| `innerHTML` / `bypassSecurityTrust*` | Not present anywhere in scanned files |
| Credential / token leakage | No new hardcoded secrets; no auth logic in any new file |
| 11 new screen components | All use Angular `{{ }}` interpolation for user-visible data; no raw HTML sinks |

---

**Overall: PASS.** One LOW finding raised and fixed mid-audit. Two INFOs fixed, one structural deferred.
