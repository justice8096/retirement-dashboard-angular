# Contribution Analysis Report (Refresh)
## retirement-dashboard-angular

**Report Date**: 2026-04-20
**Supersedes**: `audits/contribution-analysis.md` (2026-04-19)
**Cycle Scope**: 2026-04-19 → 2026-04-20 HIGH/MEDIUM remediation pass on branch `feature/audit-fixes-high-medium`
**Contributors**: Justice (Human — `justice8096@gmail.com`) · Claude Opus 4.7 (AI Assistant, dev-time only)
**Deliverable (this cycle)**: Disciplined closure of the HIGH- and MEDIUM-severity findings surfaced by the 2026-04-19 audit suite plus the a11y compliance audits (M-01 reverse tabnabbing, M-02 CSP meta, F-012/13/14/15 dyscalculia residuals, F-006 Monte Carlo calm mode, F-008 partial voice input, F-004 concrete tiles chart, DFA-001…005 readability/layout).
**Audit Type**: Delta refresh (cycle-scoped); prior-cycle cumulative numbers preserved in "Prior-vs-Current" section
**Head Commit**: tip of `feature/audit-fixes-high-medium` (fix pass for the 2026-04-20 delta)

---

## Executive Summary

**Collaboration Model (this cycle)**: **Triager–Implementer.** Justice operated as the triage owner: reviewed the code-review agent's generated TODO list, elevated HIGH and MEDIUM findings above LOW/NICE-TO-HAVE, approved the single-branch strategy (`feature/audit-fixes-high-medium`) rather than a fix-per-branch fan-out, and set the scope gate ("don't chase LOW this cycle; keep build green"). Claude did the bulk of editing — every HTML `rel="noopener noreferrer"` insertion, the CSP meta tag, the dyscalculia residuals, the MC progressive-reveal refactor, the voice-input directive wiring, the concrete tile component, and the readability lint script.

This is a narrower collaboration mode than the initial cycle (where Justice was still authoring domain math directly). On the 2026-04-20 delta, Claude was doing >85% of the keystrokes; Justice's leverage came from scope discipline and direction-setting, not from keyboard time.

**Contribution Balance — this cycle only**:

- **Architecture & Design**: 70 / 30 (Justice / Claude)
- **Code Generation**: 10 / 90 (Justice / Claude)
- **Security Auditing**: 15 / 85 (Justice / Claude)
- **Remediation Implementation**: 15 / 85 (Justice / Claude)
- **Documentation**: 30 / 70 (Justice / Claude)
- **Testing & Validation**: 85 / 15 (Justice / Claude)
- **Domain Knowledge**: 70 / 30 (Justice / Claude)
- **Overall (weighted, delta)**: **~25 / 75** (Justice / Claude)

Grade for the delta: **B+**. Higher than the overall B because the cycle was narrowly scoped, measurably closed out HIGH+MEDIUM, and left the build green.

---

## Methodology

Same approach as the 2026-04-19 analysis: commit inspection, file-level attribution of the new or mutated artifacts, code-vs-prose weighting. The delta here is scoped to the commits landed on `feature/audit-fixes-high-medium` between 2026-04-19 and 2026-04-20; cumulative project numbers are re-computed at the bottom by blending this cycle's delta into the prior cycle's totals.

Where a finding was fixed in multiple files (e.g., M-01 hit five HTML templates), each edit was counted once; Claude authored all five. Where architecture decisions were made verbally (e.g., "use a signal, not a subject, for `calmStep`"), those count toward Claude's architecture share only when the shape was novel and not dictated by Justice.

---

## Attribution Matrix (this cycle)

### Dimension 1: Architecture & Design — 70 / 30

**Justice:**
- Set the scope: HIGH + MEDIUM this cycle, LOW deferred.
- Approved the single-branch strategy (`feature/audit-fixes-high-medium`) over per-finding branches.
- Directed the prioritization order (security fixes first, then a11y residuals, then UX/MC/voice, then readability tooling last).
- Pre-set domain constraints in `MEMORY.md` that shaped `getAnchor` MAGI/FPL/cliff keys (Claude could not have picked those anchor IDs without the ACA-regime memory).

**Claude:**
- Chose the `mcMode` signal shape (`'full' | 'calm'`) plus a `calmStep` index signal plus a `showStep(n)` computed gate, rather than a more general "stepper" abstraction. This was a local design call.
- Chose the `ConcreteTilesComponent` API surface (inputs: `bins`, `scale`, `label`; output: none — purely presentational) and the `chartStyle='concrete'` enum extension rather than a separate chart type class.
- Chose the heuristic in `scripts/check-readability.mjs` for extracting prose — strip template bindings, skip attribute strings, collapse whitespace, then run sentence-length and syllable heuristics against the DFA-005 70ch-clamp target.
- Chose the voice-input parser boundary — transcript → number lives on `NumericInputDirective` (co-located with existing numeric parsing) rather than in a standalone `VoiceInputService`.

**Evidence**: The `mcMode` / `calmStep` / `showStep` signal trio and the readability lint script are novel surface area introduced this cycle with no equivalent in the prior codebase.

---

### Dimension 2: Code Generation — 10 / 90

**Justice:**
- Reviewed each file before commit, which occasionally surfaced redirections (e.g., ensuring dyscalculia-residual fixes routed through `DyscalculiaService.formatCurrencyPrecise` rather than introducing ad-hoc `toFixed` at call sites — consistent with the 2026-04-19 "always route through service" pattern Justice established).
- Did not author the bulk of the line-level edits this cycle.

**Claude:**
- Authored all five M-01 `rel="noopener noreferrer"` HTML edits.
- Authored the M-02 CSP `<meta>` tag insertion (`index.html`).
- Authored the F-012/13/14/15 edits (residual `toFixed` removals, `formatCurrencyPrecise` helper on `DyscalculiaService`, severity-color migration through the dyscalculia tone layer, `getAnchor` extensions for `magi`, `fpl`, and `cliff` glossary contexts).
- Authored `src/app/components/concrete-tiles/concrete-tiles.component.ts` from scratch (component, template, styles, input signatures) and its wiring into the FIRE calc chart-style switch.
- Authored the Monte Carlo calm/progressive-reveal refactor: new `mcMode` setting, `calmStep` signal, `showStep(n)` gate, "Show next" pacer button, template conditionals.
- Authored the voice-input partial: microphone button on `NumericInputDirective`, `SpeechRecognition` wiring (Web Speech API feature-detect), transcript-to-number parser (handles "twenty thousand", "$1,200", "1.5k", and plain digits).
- Authored the DFA-001…005 edits: Compare audit banner copy tighten + glossary key additions, `metric-notes` font-size bump (11→13px), chip-body prose spacing CSS custom properties, 70ch clamp under `.dx-enabled`, `scripts/check-readability.mjs`.

---

### Dimension 3: Security Auditing — 15 / 85

**Justice:**
- Directed the re-audit of HIGH/MEDIUM.
- Accepted the residual LOW/NICE-TO-HAVE deferral (documented scope boundary).

**Claude:**
- Re-scanned for the specific SAST findings from the 2026-04-19 suite (`rel="noopener"` absence, CSP absence) and fixed each.
- Re-ran `npm audit` equivalents and confirmed no new transitive-dep regressions from this cycle's changes (no `package.json` modifications this cycle — all edits were source-level).
- Will populate the delta row in `sast-dast-scan.md` on the next audit refresh.

---

### Dimension 4: Remediation Implementation — 15 / 85

**Justice:**
- Reviewed each remediation commit.
- Gate-kept the "build green" acceptance criterion.

**Claude:**
- Implemented every remediation in the cycle list: M-01, M-02, F-004, F-006, F-008 (partial), F-012, F-013, F-014, F-015, DFA-001, DFA-002, DFA-003, DFA-004, DFA-005.
- Drafted commit messages.

**Note**: F-008 is marked **partial** — voice-to-number is wired on `NumericInputDirective` but is not yet threaded through every input surface (e.g., scenario-compare free-text fields). Tracked for the next cycle.

---

### Dimension 5: Testing & Validation — 85 / 15

**Justice:**
- Manual in-browser validation across the touched surfaces (MC calm mode, concrete tiles chart, voice input where a mic is present, each HTML target with `rel="noopener"`, CSP header load).
- Signed off on "no regressions" — still the only party who can.

**Claude:**
- Implicit type-check and build pass during iteration.
- Ran the new `scripts/check-readability.mjs` over the templates as a smoke signal for DFA-005.
- **Did not add any `*.spec.ts` unit tests this cycle.** The test-coverage gap from 2026-04-19 persists. `check-readability.mjs` is a lint, not a unit test.

**Gap**: Same as prior cycle, unchanged. Recommendation to add seeded `monte-carlo.ts` tests and `TaxService.applyBrackets` snapshot tests still stands — and is more valuable now that the MC screen has a new progressive-reveal mode that could silently regress the underlying simulation output.

---

### Dimension 6: Documentation — 30 / 70

**Justice:**
- Continues to own `MEMORY.md` (unchanged this cycle).
- Will write this analysis's headline framing when reviewing.

**Claude:**
- Writing this report.
- Wrote the remediation commit-message bodies.
- Did not yet update `sast-dast-scan.md`, `cwe-mapping.md`, or `llm-compliance-report.md` with the post-remediation status — next cycle action.

**Gap**: README / LICENSE / SECURITY.md still absent. Unchanged from prior cycle.

---

### Dimension 7: Domain Knowledge — 70 / 30

**Justice:**
- Supplied the ACA / FPL / cliff constraints (via `MEMORY.md`) that made the `getAnchor` glossary additions correct rather than plausible-looking.
- Owns the "calm mode should not lie about results" invariant that shaped `showStep` as a display gate, not a computation gate — the underlying MC trial count and outputs are unchanged; only reveal pacing differs.

**Claude:**
- Knew the Web Speech API surface and feature-detect pattern for F-008.
- Knew the `rel="noopener noreferrer"` requirement for `target="_blank"` links (M-01) and the CSP directive syntax for M-02.
- Knew the Angular signal-composition idiom that made `showStep(n)` a `computed()` off `calmStep` and `mcMode`.

Domain split unchanged from prior cycle: Justice owns the *problem*; Claude helps navigate the *solution space*.

---

## Commit-Level Look (delta)

Branch: `feature/audit-fixes-high-medium`

All cycle commits carry the `Co-Authored-By: Claude Opus 4.7` trailer (improvement over the 9-of-20 trailer rate on the prior cycle — in line with Recommendation 1 from the 2026-04-19 report).

High-level commit groupings on the delta:
- **Security**: M-01 (5 HTML edits), M-02 (CSP meta).
- **Dyscalculia residuals**: F-012 (toFixed → DyscalculiaService), F-013 (`formatCurrencyPrecise` helper), F-014 (severity color migration), F-015 (`getAnchor` magi/fpl/cliff).
- **UX**: F-006 (MC calm mode — `mcMode` setting, `calmStep` signal, `showStep` gate, "Show next" pacer), F-008 partial (voice input on `NumericInputDirective`), F-004 (concrete-tiles chart at `src/app/components/concrete-tiles/concrete-tiles.component.ts`).
- **Readability / layout**: DFA-001 (Compare banner + glossary keys), DFA-002 (metric-notes 11→13px), DFA-003 (chip-body prose spacing vars), DFA-005 (70ch clamp under `.dx-enabled`), DFA-004 (`scripts/check-readability.mjs`).

---

## Grade

| Scope | Grade | Rationale |
|-------|:-----:|-----------|
| **Delta (this cycle)** | **B+** | Disciplined closure of HIGH+MEDIUM, scoped correctly (no LOW chase), no build regressions, no new deps, trailer attribution at 100%. Held back from A- by persistent zero-unit-test gap and F-008 being partial. |
| **Cumulative** | **B** | Unchanged from prior cycle — delta quality is high, but the absent automated-test suite is still the dominant factor and it wasn't addressed this cycle. |

---

## Prior-vs-Current Deltas

| Dimension | Prior (2026-04-19, cumulative) | This Cycle (delta) | Cumulative After This Cycle |
|-----------|:------------------------------:|:------------------:|:---------------------------:|
| Architecture & Design | 90 / 10 | 70 / 30 | ~88 / 12 |
| Code Generation | 25 / 75 | 10 / 90 | ~23 / 77 |
| Security Auditing | 20 / 80 | 15 / 85 | ~19 / 81 |
| Remediation Implementation | N/A | 15 / 85 | 15 / 85 |
| Testing & Validation | 85 / 15 | 85 / 15 | 85 / 15 |
| Documentation | 30 / 70 | 30 / 70 | 30 / 70 |
| Domain Knowledge | 70 / 30 | 70 / 30 | 70 / 30 |
| **Overall (weighted)** | **~55 / 45** | **~25 / 75** | **~52 / 48** |

Cumulative shifts slightly toward Claude because the 2026-04-20 cycle was heavily implementation-weighted and introduced the Remediation Implementation row for the first time. Architecture+Domain stay Justice-dominant, which is the shape you want — Justice's leverage is direction, not typing.

---

## Key Insight (delta)

**Justice's role compressed this cycle in a productive way.** On the initial build cycle, Justice was hand-editing domain math. On the remediation cycle, Justice was doing triage, prioritization, and sign-off — and that's a legitimate use of a solo-dev's time once the architecture and domain invariants are locked in. The cycle ran faster because Claude didn't need domain re-teaching for most findings (M-01, M-02, F-006, F-008, F-004, readability were all framework/UX work, not domain work); the domain constraints for F-015's glossary anchors came directly from the persisted `MEMORY.md`, which is exactly the context-bridge artifact working as designed.

The risk in this mode is that the test gap compounds — every shipped cycle without tests adds surface area that could regress silently. MC calm mode is a particularly good candidate because it introduces a display gate that, if implemented as a computation gate instead, would understate MC variability. A seeded kernel test would have caught a mistake of that shape.

---

## Recommendations

1. **Close the test gap next cycle.** Specifically: one seeded test over `monte-carlo.ts` (fixed seed, known percentile outputs) and one snapshot test over `TaxService.applyBrackets` for a 2024 and a 2025 filer. This alone moves Testing from D toward B- and protects the MC calm mode from regression.

2. **Finish F-008.** Thread voice input through the remaining numeric input surfaces so the partial becomes complete; update `sast-dast-scan.md` when done.

3. **Refresh `sast-dast-scan.md`, `cwe-mapping.md`, `llm-compliance-report.md`** with post-remediation rows. The audit suite should reflect that M-01 and M-02 are closed.

4. **Keep the single-branch remediation strategy.** It worked: scope stayed tight, review overhead stayed low, trailer attribution stayed 100%. Repeat on the next HIGH+MEDIUM batch.

5. **Add `scripts/check-readability.mjs` to CI.** Right now it's a local lint; wiring it into `npm run lint` (or a `lint:a11y` sub-script) closes DFA-004 from "tool exists" to "tool enforces."

6. **Still no README / LICENSE / SECURITY.md.** Unchanged from prior cycle — easy lifts, worth a 30-minute session.

---

## Appendix: Files Touched This Cycle

Categorized:
- **Security (M-01, M-02)**: five HTML templates under `src/app/components/screens/` plus `src/index.html`.
- **Dyscalculia (F-012/13/14/15)**: `src/app/services/dyscalculia.service.ts` (added `formatCurrencyPrecise`, `getAnchor` extensions), plus the call-site templates that still had residual `toFixed`.
- **Monte Carlo (F-006)**: the MC screen component (settings, signals, template), adding `mcMode`, `calmStep`, `showStep`.
- **Voice input (F-008, partial)**: `NumericInputDirective` (mic button + transcript parser).
- **Concrete chart (F-004)**: `src/app/components/concrete-tiles/concrete-tiles.component.ts` (new) plus the FIRE calc chart-style switch.
- **Readability/layout (DFA-001…005)**: Compare banner template + glossary key additions; `metric-notes` style; chip-body CSS custom properties; `.dx-enabled` 70ch clamp; `scripts/check-readability.mjs` (new).

Trailer compliance on the cycle: 100% (every commit carries `Co-Authored-By: Claude Opus 4.7`).
