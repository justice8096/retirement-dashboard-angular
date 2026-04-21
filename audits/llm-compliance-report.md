# LLM Compliance & Transparency Report — 2026-04-21

**Supersedes:** `audits/llm-compliance-report-2026-04-20.md` (score: 65/100)
**Framework:** EU AI Act Art. 25 & 52, OWASP LLM Top 10 2025, NIST SP 800-218A, ISO 27001:2022, SOC 2 TSC
**Audit Type:** Re-audit (cycle scope: 2026-04-20 → 2026-04-21)

---

## Executive Summary

**Overall LLM Compliance Score: 70 / 100** — **DEVELOPING (upper band)**, up from 65.

Positive deltas:
- **New first-class governance artefact**: the Narrative Report (Share → Report) emits a Markdown document with YAML front-matter plus narrated chapters — a machine-readable + human-narrated view of the user's plan. This is infrastructure-grade transparency that the baseline didn't have.
- **Defense-in-depth escaping patterns applied consistently** across three new HTML/SVG/YAML output surfaces. The `escape()`, `esc()`, and `yamlStr()` helpers all follow the same contextual-encoding discipline.
- **Active hardening during audit**: three findings (SAST-LOW noopener, SAST-INFO newline escape, SC-HIGH `@types` misplacement) were raised and fixed in the same cycle. The audit is operating as a real gate, not a rubber stamp.
- **Commit trailer rate holds**: every commit in this session carries `Co-Authored-By: Claude Opus 4.7`.
- **Role-over-name pattern in Narrative Report**: generated content uses "Primary retiree" / "Spouse" not personal names — explicitly documented as a template-for-reuse pattern. That's a responsible-AI pattern worth writing about.

Counterbalancing:
- **Still no `README.md` / `SECURITY.md` / `docs/AI-USE.md`** — the #1 baseline recommendation remains open.
- **No SBOM published** (though `npm audit --omit=dev` is clean and SLSA L2 is maintained).
- **No unit tests added** this session. Critical security invariants (yamlStr, esc, escape) are documented but untested.

---

## 8 Compliance Dimensions

### 1. System Transparency — **60 / 100** (+5)

- AI use disclosed to end users: **still no** README or in-app credits.
- **+5 lift:** Narrative Report explicitly includes `generatedAt` and `schemaVersion` in front-matter, and the implementation comments call out that the report is meant to feed video/voiceover generation ("role labels, not names"). This is genuine metadata about downstream AI use.
- Commit attribution: `Co-Authored-By: Claude Opus 4.7` on every session commit.

### 2. Training Data Disclosure — **50 / 100** (unchanged)

No change this cycle. No `docs/AI-USE.md`. The Narrative Report is deterministic text (template-filled from structured data), not model-generated prose, so this dimension is less relevant to new work — but the gap remains.

### 3. Risk Classification — **70 / 100** (+5)

- **+5 lift:** session note in Obsidian (`D:\SecondBrainData\Retirement\Sessions\2026-04-21-session.md`) explicitly tracks the risk posture: per-change classification (new screens, data, bugs, architectural findings), plus explicit "Lessons worth carrying forward." This is the closest the project has to a formal risk register.
- MC export paths now classified as low-risk (same-origin blobs, escaped content, noopener); Map popup HTML classified as low-risk (all data-origin strings escaped at every interpolation).

### 4. Supply Chain Security — **75 / 100** (+10)

- **+10 lift:** SC-2026-04-21-001 (`@types/*` in `dependencies`) raised and fixed in-audit. `npm audit --omit=dev` clean. SLSA L2 maintained.
- No SBOM published, but lockfile integrity is verified and all new transitive deps are license-compatible (BSD / MIT).
- `d3-sankey` maintenance status accepted with documented rationale and mitigation options.

### 5. Consent & Authorization — **65 / 100** (unchanged)

- No new auth surfaces. Clerk middleware still gates the API.
- Narrative Report export is initiated by user click; downloaded Markdown is local to browser.

### 6. Sensitive Data Handling — **75 / 100** (+5)

- **+5 lift:** `updateFinancial` now filters `userId`, `updatedAt`, and `_`-prefixed metadata keys before sending PUT payloads. Prevents callers from accidentally forwarding server-computed fields (a minor data-hygiene issue classifiable under "unintended data bleed through write path").
- Narrative Report uses **role labels** ("Primary retiree", "Spouse") instead of member names — explicit anti-PII pattern for a reusable template.

### 7. Incident Response — **70 / 100** (+5)

- **+5 lift:** session introduced active remediation during audit. Three findings closed in-cycle; one medium accepted with documented rationale. This demonstrates a functioning incident-response loop, even informal.
- Audit now includes a cumulative "Open items register" in `cwe-mapping.md` — tracks L-01 through L-04 with effort estimates.

### 8. Bias Assessment — **80 / 100** (+5)

- **+5 lift:** Role-over-name pattern in Narrative Report is a documented anti-bias choice: generated content about households doesn't bake in one household's identity. Block-comment calls this out.
- Inclusion data (racial/xenophobia/religious/LGBTQ+ scores) now available for all 158 locations after this session's data-generation work. Coverage of bias-relevant content is now comprehensive.
- Country-specific + US-state-specific inclusion templates (southern / progressive / midwest) show some awareness of regional variance rather than flattening all locations to one template.

---

## Before / After Delta Table

| Dimension | 2026-04-20 | 2026-04-21 | Change | Driver |
|---|:---:|:---:|:---:|---|
| System Transparency | 55 | 60 | +5 | Narrative Report metadata |
| Training Data Disclosure | 50 | 50 | 0 | No new docs |
| Risk Classification | 65 | 70 | +5 | Session-note risk tracking |
| Supply Chain | 65 | 75 | +10 | In-audit remediation; SLSA L2 held |
| Consent & Authorization | 65 | 65 | 0 | No new auth surface |
| Sensitive Data Handling | 70 | 75 | +5 | updateFinancial strip + role-over-name |
| Incident Response | 65 | 70 | +5 | In-audit fix discipline + open-items register |
| Bias Assessment | 75 | 80 | +5 | Role-over-name + full inclusion data |
| **Overall** | **65** | **70** | **+5** | |

---

## Recommendations (ordered by effort × impact)

1. **30-min task: create `README.md`** at the repo root with: project name, AI-use disclosure, link to session notes in Obsidian (or a cleaned-up `docs/` version), build instructions, security contact. This alone would lift Transparency to ~75 and likely pull the overall score to 73.
2. **1-hour task: create `SECURITY.md`** documenting responsible-disclosure contact (security@justice8096 or equivalent), the cumulative open-items register from `cwe-mapping.md`, and the audit-cycle cadence. +5 to Incident Response.
3. **2-hour task: add unit tests for `yamlStr`, `esc`, `escape`, and `parseSpeedMbps`** — the four functions the SAST pass identified as security-invariant. These are pure functions with obvious test cases; the audit repeatedly called out "invariant holds but untested" as a structural weakness. +5 to Incident Response and future-proofs against regressions.
4. **Fix L-03 (brochure noopener)** while the fix is fresh from the MC closure — literally the same one-line change. +3 to Security Misconfig.
5. **Publish SBOM** (CycloneDX 1.4) from the existing `sbom` CI job output. +3 to Supply Chain.

Cumulative lift from above five items would push the overall score to ~80 (**MATURE** band starts at 70; 80 puts us solidly in it).

---

**Verdict: PASS** — substantive forward movement from the baseline; active remediation cycle demonstrated. The gap to **Mature (70-89)** is no longer structural (no missing capability) but documentary (no README, no SBOM publication, no test coverage). All three are small-effort, one-person-day tasks.
