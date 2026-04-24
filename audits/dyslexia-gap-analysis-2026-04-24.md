# Dyslexia Gap Analysis — retirement-dashboard-angular

| Field | Value |
|-------|-------|
| **Project** | retirement-dashboard-angular |
| **Date** | 2026-04-24 |
| **Framework** | `D:/dyslexia-support-skill/skills/gap-analysis/SKILL.md` |
| **Baseline audits** | `audits/Dyslexia-Compliance-Audit-*-2026-04-{19,20,21}.md` (composite 92/100, A) |
| **Scope** | Gap-oriented re-frame of the dashboard against the 5 ecosystem gaps + the Shaywitz / Dehaene / structured-literacy evidence base. Compliance findings (10px axis text, Sankey double-read, etc.) are covered in the 2026-04-21 audit and are not re-litigated here. |

---

## Summary

The dashboard ships a mature *compliance-oriented* dyslexia surface (IDA-aligned copy, BDA-grade typography, multi-contrast themes, Web Speech TTS, bionic helper, reading ruler, progress bar, shortcut cheatsheet, plain-language per-screen help with a read-aloud entry point) that scored 92/100 against BDA/WCAG checklists on 2026-04-21. Re-evaluated against the **ecosystem gap framework**, however, the app sits firmly in the "passive, opt-in, one-size-fits-all" quadrant: every accommodation is gated behind the master `dyslexia.enabled` toggle (Gap 1 — retroactive), there is a single undifferentiated profile rather than a subtype-aware recommendation engine (Gap 2), assistive tools are passive transforms with no real-time phonological/morphological coaching (Gap 3 — and the bundled `bionicSegments()` helper has **zero call sites**, so the Bionic affordance is effectively shipped-but-unused), and while the contrast/font plumbing is cohesive the discovery surface is fragmented across three separate floaters (accessibility panel, help drawer, shortcut cheatsheet) that don't cross-link (Gap 4). The evidence-base checklist is strong on typography (Atkinson Hyperlegible, OpenDyslexic 400+700, Lexie Readable all loaded; 1.4–1.8× line-height tiers; 70ch clamp when enabled; four non-pure contrast modes) but weak on interactive structured-literacy affordances: no syllable or morpheme breaks, no fluency pacing, no pause/resume on TTS, no per-screen "read this section" buttons outside the help drawer, italics still used on `.hc-anchor` / `.audit-hint` / chart placeholder, and six screens apply `text-transform: uppercase` on labels. Top recommended moves are (1) ship a sensible dyslexia-lite default (line-height 1.6 + 70ch clamp) without requiring the master toggle, (2) actually wire `bionicSegments()` into at least the help panel and insight bullets, and (3) add per-paragraph read-aloud buttons to numeric-heavy screens (Monte Carlo, Taxes, Costs) where the dense prose + table combo is hardest to parse.

---

## What Exists Today

Pulled from the codebase as of 2026-04-24:

| Surface | File | Notes |
|---|---|---|
| Settings model & defaults | `src/app/models/dyslexia.model.ts` | 11 fields (`enabled`, `fontFamily`, `lineHeight`, `letterSpacing`, `wordSpacing`, `contrastMode`, `readingAid`, `readAloudEnabled`, `readAloudRate`, `showReadingProgress`, `showShortcutHints`). Four font families, three line-heights (1.4/1.6/1.8), four contrast modes. All defaults `false` / `normal` / `dark` / `none`. |
| State service | `src/app/services/dyslexia.service.ts` | Signals-based store; persists to localStorage (coalesced via `requestIdleCallback`); projects settings to `:root` CSS vars (`--app-font-family`, `--prose-line-height`, etc.) and toggles `dx-*` classes. Owns Web Speech API lifecycle (`readAloud`, `stopReading`, `isReading`). `bionicSegments()` helper present. |
| Settings UI | `src/app/components/dyslexia-settings/dyslexia-settings.component.ts` | Master toggle + 8 chip-group sections under `@if (dyslexia.isEnabled())`. Plain-language copy cites BDA & IDA KPS. Nothing renders when disabled. |
| Accessibility panel shell | `src/app/components/accessibility-panel/accessibility-panel.component.ts` | Tabs: Display · Reading & Text · Numbers & Data. Status-dot indicator when `dyslexia.isEnabled()`. |
| Global mounts | `src/app/app.component.ts` | Conditionally mounts `<app-read-aloud-button>` only when `dyslexia.canReadAloud` is true; renders `.dx-reading-progress` and `.dx-ruler` only when `dyslexia.isEnabled()` and the sub-flag is on. |
| Floating TTS | `src/app/components/read-aloud-button/read-aloud-button.component.ts` | Single FAB, binary speak/stop, `Ctrl+Shift+R`. Polls `isReading()` every 250 ms. No pause/resume, no per-paragraph scoping (grabs the whole `app-mock-content` textContent). |
| Help drawer | `src/app/components/help-panel/help-panel.component.ts` + `src/app/content/help-content.ts` | Plain-language per-screen help at grade-8 target, chunked paragraphs, glossary chips. Includes its own read-aloud 🔊 icon button. |
| Shortcut cheatsheet | `src/app/components/shortcut-cheatsheet/shortcut-cheatsheet.component.ts` | `?` opens; lists TTS, panel-toggle, F1 help. |
| CSS plumbing | `src/styles.scss` | Contrast classes (`dx-contrast-softer-dark`, `-cream`, `-light`) override `--dark-*` tokens so Material picks up without recompile. 70ch `max-width` clamp on prose *only when* `html.dx-enabled` is present. |
| Fonts loaded | `src/index.html` | Inter (400–700), Atkinson Hyperlegible (400, 700), Lexend (400–600), OpenDyslexic (400, 700 via fontsource/jsdelivr). |

---

## Gap Assessment

Status key: ✗ gap open · ~ partial · ✓ no gap.

### Gap 1 — Retroactive vs. Proactive Accessibility ✗ OPEN

**Finding.** Every dyslexia accommodation is gated behind `DYSLEXIA_DEFAULTS.enabled === false` (`dyslexia.model.ts:34`). Until the user discovers the Accessibility Panel (`Ctrl+Shift+A`), flips the master toggle, and optionally tunes 8 chip groups, they get the Inter baseline with line-height 1.5, letter-spacing 0, and no ruler, TTS, progress bar, or 70ch clamp. The 70ch prose clamp itself is explicitly scoped `html.dx-enabled p, html.dx-enabled .prose, …` in `styles.scss:183-196` — it does not apply to readers who don't opt in, even though it is a universally-beneficial cognitive-load tweak.

**Evidence.**
- `dyslexia.service.ts:170` — all CSS property projection is inside `if (s.enabled)`.
- `app.component.ts:46, 66, 71` — progress bar, ruler, TTS FAB all guarded on `dyslexia.isEnabled()`.
- `dyslexia-settings.component.ts:36` — `@if (dyslexia.isEnabled())` wraps everything except the master toggle.

**Impact.** A dyslexic visitor who doesn't know the feature exists gets nothing. Cognitive-neuroscience evidence (Shaywitz/Dehaene) places the prevalence floor around 5–10% of adult readers; the *opt-in-only* gate captures only those already self-identifying.

**Fix direction.** Ship a "dyslexia-lite default" — promote line-height 1.6, letter-spacing 0, word-spacing 0, 70ch clamp, and focus-visible outlines to baseline without requiring the toggle. Reserve the master toggle for *additive* affordances (OpenDyslexic font, ruler, progress bar, TTS).

### Gap 2 — Personalized Accommodation Engine ✗ OPEN

**Finding.** One undifferentiated profile. The model has no notion of dyslexia subtype (phonological vs. surface vs. mixed vs. visual stress), no onboarding questionnaire, and no presets ("Irlen-style visual stress → cream + wide word-spacing + no bionic"; "phonological profile → slower TTS + syllable breaks"; "surface dyslexia → morpheme highlighting + glossary-first"). Users must hand-tune 8 independent chip groups with no guidance on which combinations fit which profile.

**Evidence.**
- `dyslexia.model.ts:8-31` — flat settings interface; no profile enum.
- `dyslexia-settings.component.ts` — no preset buttons, no onboarding flow, no "what kind of reader are you" questionnaire.
- `onboarding.component.ts` — does not mention dyslexia (verified by grep: no occurrences of phonolog*, syllable, morpheme in onboarding).

**Impact.** This is the hardest gap and the most speculative to fix — but even a **3-preset picker** ("Soft-start", "Cream + Atkinson", "Full support") would collapse the decision tree meaningfully. Currently the only "smart" behavior is `toggle()` auto-flipping `showReadingProgress=true` on first enable (`dyslexia.service.ts:51-72`).

**Fix direction.** Add a 3–4 preset picker on the Dyslexia tab with plain-language labels ("Just widen the text", "Cream background + dyslexic font", "Everything on"). Keep per-field chips for power users.

### Gap 3 — Passive vs. Interactive Assistive Tools ✗ OPEN

**Finding.** All implemented tools are passive transforms. TTS is play/stop (no pause/resume, no word-level highlight-while-reading, no rate change mid-utterance). Bionic bolding exists *in the service* (`bionicSegments`, line 131) and *in CSS* (`.bionic-text strong`, styles.scss:213) but has **zero render call sites** — `Grep bionic-text` finds only the CSS rule. The ruler is purely decorative (tracks mouse Y, doesn't snap to a line of text or chunk sentences). No syllable breaks, no morpheme highlighting, no fluency-pacing (metronome-style word reveal), no phonological cueing on glossary terms.

**Evidence.**
- `Grep "bionicSegments|bionic-text"` → only the service definition and the CSS rule; no template usage.
- `Grep "chunked|syllable|morpheme|phonolog|phonics"` → 2 hits (help.model.ts comment, dyslexia-settings.component.ts info footer). No runtime logic.
- `read-aloud-button.component.ts:79-96` — binary toggle only; `dyslexia.service.ts:102-118` has no `pauseReading()`.

**Impact.** The dashboard markets "reading aid" but the most researched interactive tool (Bionic) is inert. TTS is functional but non-trivial text (a 400-word Monte Carlo insights block) becomes a one-shot listen-or-restart experience. This is the highest-leverage gap because the scaffolding *already exists*.

**Fix direction.** (a) Wire `bionicSegments()` into help-panel paragraphs and each screen's insight bullets via a small presentational `<app-bionic>` component. (b) Add `pauseReading()` / `resumeReading()` to the service and a 3-state FAB. (c) On the help panel, add a per-paragraph 🔊 button so users can replay a single chunk rather than the whole screen. (d) For glossary terms, expose a "sound it out" affordance that splits the word on syllable boundaries (e.g., `RM·D`, `MA·GI`).

### Gap 4 — Fragmented Tool Ecosystem ~ PARTIAL

**Finding.** Coherent at the *CSS token* layer (all dyslexia state flows through six CSS variables and three body classes, so adding a new screen just needs `line-height: var(--prose-line-height, 1.5)` and gets the 70ch clamp for free). Fragmented at the *UX discovery* layer: three separate floaters (Accessibility Panel via `Ctrl+Shift+A`, Help Drawer via `F1`, Shortcut Cheatsheet via `?`) with overlapping concerns and no cross-links. The read-aloud FAB lives bottom-right; the help-panel read-aloud icon lives top-right of the drawer; they are separate UI atoms with separate visual treatments.

**Evidence.**
- `accessibility-panel.component.ts` vs `help-panel.component.ts` vs `shortcut-cheatsheet.component.ts` — three standalone components, no shared "accessibility hub" landing.
- Only 4 files reference `app-read-aloud-button` / `readAloud(`: the service, the FAB, the help panel, and app.component.ts — per-screen components do **not** import it.

**Impact.** Users who open Help won't find the font/spacing options (they're one panel over). A blind reader relying on a screen reader learns about `Ctrl+Shift+R` only by opening the cheatsheet. This is the "fragmented ecosystem" gap at a single-app scale.

**Fix direction.** One small change: in the Accessibility Panel's Reading & Text tab, add a "More ways to read" section that deep-links to `/help` and announces the `Ctrl+Shift+R` / `?` / `F1` shortcuts inline (not just in a separate modal).

### Gap 5 — Disconnected Progress Monitoring — **N/A (skipped per prompt; not a literacy app).**

---

## Evidence-Base Checklist

Marked against Shaywitz phonological-deficit theory, Dehaene VWFA work, and structured-literacy UI research (BDA, IDA KPS, BDA Dyslexia Style Guide, Rello & Baeza-Yates 2013 spacing study).

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | OpenDyslexic available | ✓ | `index.html:19-20` — 400 + 700 via fontsource. |
| 2 | Atkinson Hyperlegible available | ✓ | `index.html:15` — 400 + 700 via Google Fonts. |
| 3 | Lexie Readable available | ~ | Referenced in the font-family stack (`dyslexia.model.ts:73`) but **no `<link>` in index.html** — will fall through to Atkinson / Inter. Either drop the option or self-host. |
| 4 | 2.5× line-spacing option | ✗ | Tiers cap at 1.8× (`DYSLEXIA_LINE_HEIGHTS.loose = 1.8`). Rello & Baeza-Yates and BDA 2018 both recommend up to 2.0× for severe phonological profiles; consider adding an `extra-loose: 2.0` tier. |
| 5 | 1.5× letter-spacing via `tracking` | ✗ | Only `normal` (0) and `wide` (0.08em). 0.12em is the BDA minimum for "wide"; add a `very-wide: 0.15em` or relabel "wide" to 0.12em. |
| 6 | 60–70 char paragraph width | ✓ | 70ch clamp at `styles.scss:183-196`, but only when `dx-enabled` (see Gap 1). |
| 7 | Sans-serif default, no serifs | ✓ | Inter baseline; no serif fonts loaded. |
| 8 | No italics on body text | ✗ | Found in `chart-placeholder.component.ts:161`, `stat-card.component.ts:67`, `assumptions-screen.component.ts:515-516`, `location-compare.component.ts:723-724`, `source-tooltip.component.ts:120`. These are hints/anchors but are body-grade prose. |
| 9 | No ALL CAPS / `text-transform: uppercase` on labels longer than 3 chars | ✗ | 14+ occurrences across `brochure-screen`, `estate-screen`, `fees-screen`, `guardrails-screen`, `healthcare-compare-screen`, `location-compare`, `medicine-screen`, `onboarding`, `shortcut-cheatsheet`, `source-tooltip`, `help-panel`, etc. Most are "LABEL" pill chrome. BDA explicitly lists uppercase as a dyslexia barrier (letter-shape recognition). |
| 10 | Text-to-speech / read-aloud | ~ | Present but *opt-in-on-opt-in* (requires `enabled` + `readAloudEnabled`). No pause/resume. Whole-screen scope only. |
| 11 | Chunking (short paragraphs, visual separators) | ✓ | `help-content.ts` is explicitly chunked. Screen "insights" blocks are bullet lists. |
| 12 | Reduced-clutter mode | ✗ | No "focus mode" / "read mode" that hides the side rail, context bar, and stat-card grid to present prose alone. |
| 13 | Syllable / morpheme break highlighting | ✗ | Not implemented. No library imported (hyphen, hyphen-en-us, compromise). |
| 14 | Anchor landmarks + predictable navigation | ✓ | Consistent 3-rail layout, `aria-label`s on rails, focus-visible patterns (post DFA-2026-04-21-004 fix). |
| 15 | Contrast beyond pure white-on-black | ✓ | Four non-pure modes in `styles.scss:87-143`, all within WCAG AA and avoiding pure #FFF/#000. |
| 16 | Focus-visible outlines | ~ | Added globally per DFA-2026-04-21-004 (carry-over); TTS FAB has explicit `:focus-visible` (`read-aloud-button.component.ts:48`). |
| 17 | Reading progress indicator | ~ | Implemented but **default off** (DFA-2026-04-19-008 carry-over). `toggle()` auto-flips it on first enable which is a good nudge. |
| 18 | Reading ruler that follows the line | ~ | Follows cursor Y, not the line the reader is actually on. Not snapped to text baseline — a mousemove interpolation. |
| 19 | Glossary / plain-language support | ✓ | `help-content.ts` glossaryKeys + `GlossaryService` chips; strong. |
| 20 | Speech rate customization | ✓ | Three rates (0.8 / 1.0 / 1.25). |

---

## Prioritized Recommendations

### Must (ship next sprint — highest ratio of impact to effort)

1. **Wire `bionicSegments()` into at least one render path.** The service helper and CSS rule already exist; shipping dead code is worse than not shipping it. Add a small `<app-bionic [text]="..." />` component and use it in help-panel `<p>` rendering and each screen's insight bullets. Effort: S.
2. **Promote dyslexia-lite to baseline.** Apply `line-height: 1.6`, the 70ch prose clamp, and focus-visible outlines to *all* readers, not just `html.dx-enabled`. Keep font/contrast/ruler/bionic/TTS behind the opt-in. Effort: XS (move one selector in `styles.scss`). Closes Gap 1.
3. **Pause/resume TTS.** Add `pauseReading()` / `resumeReading()` to the service; 3-state FAB (play / pause / stop). Carry-over DFA-2026-04-19-007. Effort: S. Closes half of Gap 3.
4. **Eliminate italics on body-grade prose.** Convert `.hc-anchor`, `.audit-hint`, `.audit-anchor`, chart placeholder, stat-card, and source-tooltip from `font-style: italic` to a lighter weight or muted color. Effort: XS (global find-replace across 6 files).
5. **Add `Lexie Readable` `<link>` or drop the option.** Right now picking "Lexie" silently falls through to Atkinson. Effort: XS.

### Should (next 1–2 sprints)

6. **3-preset picker on the Dyslexia tab.** "Just more spacing" / "Cream + Atkinson" / "Everything on". Partial close of Gap 2.
7. **Per-paragraph read-aloud in help panel.** A 🔊 icon next to each `<p>` in `help-panel.component.ts`, using the same `DyslexiaService.readAloud(text)` API. Users can replay one chunk instead of the whole drawer.
8. **Per-screen read-aloud on numeric-heavy screens.** Monte Carlo, Taxes, Costs — embed `<app-read-aloud-button>` scoped to the prose block (insights, guardrail narrative), not the whole `app-mock-content`.
9. **Replace `text-transform: uppercase` on pill labels with a sentence-case equivalent + letter-spacing + color treatment.** 14+ occurrences; one mixin in `styles.scss` can convert them.
10. **Extra-loose line-height + very-wide letter-spacing tiers.** Small additions to the enum + token map; no architectural change.

### Could (when time / validation allows)

11. **Syllable-break highlighting for glossary terms.** Use `hyphen-en-us` (npm, small) on `GlossaryEntry.term`; render `RM·D` in the chip hover card.
12. **"Focus mode" / reading room** — hide rails and stat grid, present the current screen's prose in a 70ch centered column. Closes Gap 4 fragmentation partially.
13. **Onboarding micro-survey.** Two Q's on first run ("Do you find long lines of text hard to track?" / "Does white-on-black strain your eyes?") that pre-select a dyslexia preset. Validated progress toward Gap 2.
14. **Dashboard-level accessibility hub screen.** A single `/accessibility` route listing all affordances with demos, replacing the fragmented Panel + Help + Cheatsheet trio as *the* single answer to "how do I make this easier to read?".

---

## Appendix — File References

All paths absolute, from repo root `D:/retirement-dashboard-angular/`.

- `src/app/services/dyslexia.service.ts` — state + TTS + bionic helper.
- `src/app/models/dyslexia.model.ts` — 11-field settings shape, defaults, token maps.
- `src/app/components/dyslexia-settings/dyslexia-settings.component.ts` — Accessibility Panel > Reading & Text tab contents.
- `src/app/components/accessibility-panel/accessibility-panel.component.ts` — tab shell (Display / Reading / Numbers).
- `src/app/components/read-aloud-button/read-aloud-button.component.ts` — floating TTS FAB.
- `src/app/components/help-panel/help-panel.component.ts` — plain-language help drawer with embedded read-aloud.
- `src/app/content/help-content.ts` — per-screen help copy (grade-8 target).
- `src/app/components/shortcut-cheatsheet/shortcut-cheatsheet.component.ts` — `?` cheatsheet.
- `src/app/app.component.ts` — global mounts for ruler, progress bar, TTS FAB; host listeners for `?`, `F1`, mousemove, scroll.
- `src/styles.scss` — contrast classes, `--app-font-family` / `--prose-*` tokens, bionic CSS, ruler CSS, 70ch `html.dx-enabled` clamp.
- `src/index.html` — font `<link>` tags (Atkinson, Inter, Lexend, OpenDyslexic; no Lexie Readable).
- `audits/Dyslexia-Compliance-Audit-retirement-dashboard-angular-2026-04-21.md` — most recent compliance audit; 92/100. Three carry-over findings (DFA-2026-04-19-006/007/008).

### Dead-code call sites worth closing

- `DyslexiaService.bionicSegments()` — defined `dyslexia.service.ts:131`; referenced nowhere. CSS `.bionic-text strong` rule (`styles.scss:213`) has no matching markup.
- "Lexie Readable" option in `DYSLEXIA_FONT_FAMILIES` (`dyslexia.model.ts:73`) — no `@import` or `<link>`, so selection silently falls through to Atkinson.
