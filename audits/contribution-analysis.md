# Contribution Analysis Report — 2026-04-21

**Supersedes:** `audits/contribution-analysis-2026-04-20.md`
**Cycle Scope:** 2026-04-20 → 2026-04-21 (2-day feature-port sweep + audit remediation)
**Contributors:** Justice (Human — justice8096@gmail.com) · Claude Opus 4.7 (1M context)
**Deliverable:** 11 new screens, MC export pipeline, Inclusion data restoration, Location Map, Narrative Report, 6 bug fixes, full post-commit audit cycle with in-audit remediation.
**Audit Type:** Delta (cycle-scoped). Prior cumulative numbers in earlier reports.
**Collaboration Model:** **Director–Implementer with active veto.**

---

## Executive Summary

This cycle was the most Claude-heavy session to date by keystroke volume (~90%+ of code was Claude-authored). **But the directional calls — what to build, what to skip, what to fix — were Justice's**. Several pivots originated from user observation that would never have come from code review alone:

- **"$1,500,000/mo is a bad FIRE setup amount"** — the user saw the `/mo` suffix on the FIRE Number at first glance. Caught a display bug the code-reviewer wouldn't flag because it's display semantics, not logic.
- **"local currency code as EUR showed a 1:1 ratio of Dollars"** — user tested the Fees & Currency screen manually, uncovered a cross-reference gap in `exchangeRate()` that no code scanner would catch.
- **"household member names falling back to roles works much better"** — user shifted the Narrative Report from names to roles for video-generation reuse. That wasn't a bug; it was a direction-setting decision that required product judgment.
- **"do we have enough data for the QoL and Climate?"** — user asked for a data coverage audit before trusting the new screens. Surfaced two real bugs in QoL scoring (safety/health `× 2` cap, internet `parseInt('1Gbps') = 1`) that the screens shipped with.

The collaboration pattern: Justice scoped, directed, and actively **reviewed-while-using**. Claude did the keyboard work and the security-sensitive patterns.

---

## Contribution Balance — This Cycle

| Dimension | Justice | Claude | Rationale |
|---|:---:|:---:|---|
| Architecture & Design | 70% | 30% | User chose which screens to port, grouped work into pragmatic batches, vetoed ManageLocations and DataExport, redirected from PDF/CSV export to Narrative Report. Claude designed the individual components (template signals, computed chains, effects, service boundaries). |
| Code Generation | 10% | 90% | Claude authored essentially every line of the 11 new screens + the MC export pipeline + the Narrative Report. Justice didn't touch the keyboard during implementation. |
| Security Auditing | 40% | 60% | Justice initiated the `/post-commit-audit`. Claude orchestrated the three parallel scan agents. Claude wrote the audit reports; Justice's role was to approve the scope and accept the risk register. |
| Remediation (bug fixes) | 60% | 40% | Most bugs were Justice's catches (`/mo` unit, Fees 1:1, report names). Claude did the fix once the problem was named. Exception: the dirty-tracking signal bug on MC was Claude's own diagnosis + fix from the user's one-line complaint ("Inputs changed - the results below are from the previous run" continually). |
| Testing & Validation | 30% | 70% | Claude used browser MCP to verify every screen renders with real data. Justice did manual review passes and flagged UX issues the browser automation missed (currency 1:1, name-vs-role). |
| Documentation | 25% | 75% | Claude wrote the session note in Obsidian, audit reports, and inline comments. Justice provided the direction ("save our dialogs and everything you find of note") and reviewed-by-glance. |
| Domain Knowledge | 80% | 20% | Visa research was Justice asking questions and Claude answering from knowledge cutoff data (Spain NLV, Portugal D7, Panama Pensionado). Math models (Guyton-Klinger, IRMAA brackets, Sankey flows) Claude implemented from structure; Justice validated by running MC with real numbers and checking outcomes. |

**Overall (keystroke-weighted):** ~15% Justice / 85% Claude.
**Overall (decision-weighted):** ~55% Justice / 45% Claude.

The gap between these two numbers is the story of this cycle.

---

## Quality Grade: **A-**

| Criterion | Grade | Justification |
|---|:---:|---|
| **Shipped artefacts** | A | 11 new screens, 2 data pipeline restorations (neighborhoods + inclusion), 4 independent screen-level bugs fixed, 1 data-shape bug (inclusion nested/flat), 1 rate-limit cascade fixed, MC export added, Narrative Report added. All verified live in browser. |
| **Audit hygiene** | A | Full post-commit audit cycle with 3 parallel scanners, 2 synthesis reports, summary index. Three findings (one HIGH supply-chain, one LOW SAST, one INFO encoding) raised and fixed in-cycle. |
| **Defense in depth** | A | Three distinct HTML-generation sites (map popups, MC SVG export, Report YAML) each ship with purpose-built escape helpers applied at every interpolation point. The pattern is consistent, not ad-hoc. |
| **Documentation** | B+ | Session note in Obsidian is comprehensive (184 lines covering everything). Inline comments are disciplined — especially the "why roles not names" block comment anticipating future-me's urge to revert. No `README.md` / `SECURITY.md` added — baseline gap not closed. |
| **Test coverage** | C | No new unit tests. Critical security invariants (`yamlStr`, `esc`, `escape`, rate resolution) documented but untested. Reliance on live-browser verification is working for now but doesn't scale. |
| **Governance artefacts** | B | Narrative Report adds a first-class transparency artefact. Session note serves as informal risk register. Still no README, still no SBOM publication. |

The single grade-pulling-down item is test coverage. If unit tests were added for the four security-invariant pure functions (yamlStr, esc, escape, parseSpeedMbps), this would be a clean A.

---

## Pivots worth documenting

1. **Fees/Currency exchange-rate fix** — user typed "EUR" and saw 1:1. Original code only read rates from `selectedLocation()` (the active detail view), not from the multi-selection. Fix cross-references `selectedFullLocations()` for a currency match. Also added a warning banner for the default-1.0 case. This was a **direction-setting pivot**: Claude would have happily left the silent fallback in place.

2. **Name → role in Narrative Report** — user flagged that "Justice is 62 years old and lives with Spouse" hardcodes the template. Changed to "The primary retiree is 62 years old and is planning alongside a spouse". Added a block-comment anchoring the reasoning so future-me doesn't revert. This is a **reusable-template pattern** that applies beyond this one screen.

3. **InclusionScreen orphan discovery** — while wiring the racism/xenophobia data, found an entire component that existed but was never in navigation. Wired it in + fixed two shape-normalization bugs (`data.racial` vs `data.categories.racial`, `overall.score` vs `overallInclusionScore`).

4. **Dual seed-pipeline cleanup** — `prisma/seed-neighborhoods.ts` was a parallel path that would silently overwrite hand-authored data with generic templates if anyone ran it. Deleted it after confirming `prisma/seed.ts` covers the canonical path.

5. **In-audit remediation rhythm** — when the supply-chain scan surfaced `@types/*` in `dependencies`, fixed it immediately and updated the audit to say "RESOLVED in this audit cycle" rather than waiting for a follow-up pass. Same for the SAST `noopener` gap and the YAML newline escape. Tight-loop remediation.

---

## Prior-cycle cumulative (preserved)

Cycle totals from prior reports carry forward unchanged; this cycle's delta is additive.

- **Cumulative keystrokes:** heavily Claude-weighted across all cycles.
- **Cumulative directional calls:** heavily Justice-weighted.
- **Cumulative test coverage:** low but stable — this is a known gap tracked across every cycle.

---

**Signed:** post-commit audit suite, 2026-04-21. Next audit cycle after next major feature batch or 7-day deferral, whichever comes first.
