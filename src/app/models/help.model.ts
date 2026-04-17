/**
 * Screen-level help content shown by HelpPanelComponent.
 *
 * Entries are keyed by `Screen.id` (see navigation.model.ts). Content is
 * written plain-language / grade-8-ish and chunked into short paragraphs
 * so the dyslexia accommodations (TTS, line spacing, Bionic bolding) land
 * cleanly. Financial terms use `glossaryKey` lookups against /api/glossary
 * rather than inline definitions — definitions stay in one place.
 */

export interface HelpSection {
  heading: string;
  /** 1–3 short paragraphs. Keep each sentence ≤ 20 words where possible. */
  body: string[];
}

export interface HelpEntry {
  screenId: string;
  title: string;
  /** One-sentence summary shown at the top of the drawer. */
  summary: string;
  sections: HelpSection[];
  /** Glossary keys (match /api/glossary entries) rendered as term chips. */
  glossaryKeys?: string[];
  /** Screen ids rendered as "See also" links. */
  related?: string[];
  /** Short practical tips. */
  tips?: string[];
}
