# retirement-dashboard-angular

Angular 19 SPA for retirement planning — scenarios, Monte Carlo
simulation, ACA modeling, cost-of-living comparison across 88
locations. Built as the frontend for
[`retirement-api`](https://github.com/justice8096/retirement-api);
the two ship together but can be reviewed independently.

[![CI](https://github.com/justice8096/retirement-dashboard-angular/actions/workflows/ci.yml/badge.svg)](https://github.com/justice8096/retirement-dashboard-angular/actions/workflows/ci.yml)
[![Dyscalculia A](https://img.shields.io/badge/Dyscalculia-A_(93%2F100)-brightgreen)](audits/Dyscalculia-Compliance-Audit-retirement-dashboard-angular-2026-04-20.md)
[![Dyslexia A](https://img.shields.io/badge/Dyslexia-A_(93%2F100)-brightgreen)](audits/Dyslexia-Compliance-Audit-retirement-dashboard-angular-2026-04-20.md)

---

## What it does

- **Household modeling** — members, pets, Social Security claim ages,
  target retirement income. Cross-device sync via `/api/me/preferences`.
- **Portfolio + allocation** — stocks / bonds / cash / international;
  expected return + inflation + FX drift.
- **Monte Carlo simulation** — 5 000-run default, with bull / bear
  regime switching. Progressive-reveal "calm mode" for users who don't
  want the full wall of charts at once (Dyscalculia F-006).
- **FIRE calculator** — includes concrete-tile visualization for users
  who prefer subitizable magnitude cues over raw numbers (F-004).
- **Location compare** — side-by-side cost of living across 88 seed
  locations plus per-user custom locations.
- **ACA modeling** — MAGI + FPL + subsidy cliff / enhanced regime
  toggle. Plain-language explanations of every threshold.
- **Accessibility-first** — dyscalculia / dyslexia accommodations
  (font, contrast, spacing, read-aloud, reading ruler, bionic reading)
  are first-class preferences, stored in
  `/api/me/preferences.accessibility`.

---

## Stack

| Concern | Choice |
|---|---|
| Framework | Angular 19 (standalone components + signals) |
| Language | TypeScript (strict, ESM) |
| State | Angular signals + computed() |
| UI | Angular Material 19 |
| Charts | Hand-rolled SVG (bar-only — audit requirement) |
| Maps | Leaflet + OpenStreetMap tiles |
| Routing | Angular Router |
| Tests | Angular CLI default (`ng test`) |
| Accessibility prose lint | `scripts/check-readability.mjs` (zero-dep Flesch-Kincaid) |

---

## Quickstart

```bash
# 1. Install
npm install

# 2. Start the backend (separate repo)
#    See https://github.com/justice8096/retirement-api — defaults to http://localhost:3000

# 3. Serve the dashboard (dev)
npm start
# Runs `ng serve` on http://localhost:4200
```

The dev build points at `http://localhost:3000/api` by default
(see `src/environments/environment.ts`). Production build hits
`/api` on the same origin.

---

## Scripts

```bash
npm start                   # ng serve (dev)
npm run build               # ng build (production)
npm run watch               # ng build --watch
npm test                    # ng test
npm run check:readability   # Flesch-Kincaid grade check on prose
```

---

## Accessibility posture

Every number and every label in this app goes through a cognitive-
accessibility filter. Opt-in settings live under `Ctrl+Shift+A`
(accessibility panel).

| Track | Mechanism |
|---|---|
| Dyscalculia number formatting | `DyscalculiaService.formatCurrency()` — standard / spaced / words |
| Dyscalculia magnitude anchors | `getAnchor(amount, context)` on every large number |
| Dyscalculia MC calm mode | Step-by-step reveal of Monte Carlo results (F-006) |
| Dyscalculia concrete visuals | `ConcreteTilesComponent` — 1 tile = $10k |
| Dyscalculia voice entry | `🎤` button on currency / rate inputs (Web Speech API) |
| Dyslexia font choice | Inter default + Atkinson Hyperlegible + OpenDyslexic + Lexie Readable |
| Dyslexia contrast modes | Default dark / softer-dark / cream / light |
| Dyslexia prose spacing | User-adjustable line-height / letter-spacing / word-spacing CSS vars |
| Dyslexia reading aids | Bionic bolding + reading ruler + reading-progress bar |
| Dyslexia TTS | Web Speech API read-aloud (`Ctrl+Shift+R`) |
| Plain-language API | [`/api/glossary`](https://github.com/justice8096/retirement-api) — 26 terms |
| WCAG 2.2 AA | 70ch prose clamp + 14 px chip/tab floor + 4.5:1 contrast + skip-nav |

Audit scores (2026-04-20):
- **Dyscalculia: 93 / 100 (A)**
- **Dyslexia: 93 / 100 (A)**

Full evaluation:
[`audits/Dyscalculia-Compliance-Audit-retirement-dashboard-angular-2026-04-20.md`](audits/Dyscalculia-Compliance-Audit-retirement-dashboard-angular-2026-04-20.md)
/ [`audits/Dyslexia-Compliance-Audit-retirement-dashboard-angular-2026-04-20.md`](audits/Dyslexia-Compliance-Audit-retirement-dashboard-angular-2026-04-20.md).

---

## Security

- **CSP meta tag** with strict `default-src 'self'`; no inline scripts.
- **No unsafe DOM sinks** — zero `innerHTML` bindings, zero
  `DomSanitizer` bypass calls. Enforced in CI via `grep` guardrails.
- **Every `target="_blank"`** carries `rel="noopener noreferrer"`.
- **`localStorage`** stores only accessibility prefs — no tokens / PII.
- **Authentication** is delegated to `retirement-api`; the dashboard
  never handles session tokens directly.

Full policy + disclosure process: [`SECURITY.md`](SECURITY.md).

Latest SAST scan:
[`audits/sast-dast-scan-2026-04-20.md`](audits/sast-dast-scan-2026-04-20.md)
— 0 CRITICAL / 0 HIGH / 0 MEDIUM app-source findings.

---

## AI-assisted development

This project is developed by a single maintainer with material
assistance from [Claude](https://claude.ai) (model: Claude Opus 4.7 as
of 2026-04). Every commit is human-reviewed before push; destructive
git operations are always gated on explicit approval. Per-cycle
attribution split, grading, and methodology live in
[`audits/contribution-analysis-2026-04-20.md`](audits/contribution-analysis-2026-04-20.md).

The LLM-compliance posture (EU AI Act Art. 25 / 52, NIST SP 800-218A,
OWASP LLM Top 10 2025, ISO 27001) is audited and scored in
[`audits/llm-compliance-report-2026-04-20.md`](audits/llm-compliance-report-2026-04-20.md).

---

## Key docs

| | |
|---|---|
| [SECURITY.md](SECURITY.md) | Disclosure SLA + contact |
| [audits/](audits/) | Dated compliance + security audit set |
| [CLAUDE.md](CLAUDE.md) | AI-assistant onboarding (read this if you're also Claude) |
| Paired backend | [`retirement-api`](https://github.com/justice8096/retirement-api) |

---

## License

**All Rights Reserved.** This repository is publicly readable but is
not open source. Running, modifying, redistributing, or hosting this
software requires prior written authorization from the copyright
holder. See [`LICENSE`](LICENSE) for full terms.

Individual UI components may, from time to time, be extracted into
separate repositories under **[Creative Commons Zero (CC0 1.0
Universal)](https://creativecommons.org/publicdomain/zero/1.0/)**. Those
extracts are governed by their own LICENSE files and are freely
reusable; the parent repository you are reading now is not.

**Available CC0 extracts:**

- [`retirement-ui-concrete-tiles`](https://github.com/justice8096/retirement-ui-concrete-tiles)
  — magnitude-tile visualization component (Dyscalculia F-004).

**Planned extracts (not yet extracted):**

- `src/app/directives/numeric-input.directive.ts` (voice-entry directive)
- `src/app/services/dyscalculia.service.ts` + `dyslexia.service.ts`
- `src/app/components/read-aloud-button/`
- `src/app/components/shortcut-cheatsheet/`

For licensing enquiries: `justice8096@gmail.com`.

---

## Contributing

This is currently a solo project. Bug reports and security disclosures
welcome — see [SECURITY.md](SECURITY.md) for the channel + SLA.
