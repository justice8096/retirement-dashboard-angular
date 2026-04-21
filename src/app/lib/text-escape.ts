/**
 * Security-invariant text escapers shared across screens that generate
 * non-Angular-template output (SVG exports, Leaflet popup HTML, YAML
 * front-matter in Markdown downloads). Extracted from per-screen local
 * helpers so they can be unit-tested in isolation.
 *
 * Tests: `scripts/test-text-escape.mjs` (Node built-in test runner).
 *
 * Audit trail:
 *   - SAST 2026-04-21: noted that each helper was "documented but untested"
 *   - Contribution analysis 2026-04-21: unit tests for these four functions
 *     listed as the #2 priority backlog item
 */

/** Escape the five XML entity characters for safe interpolation into raw
 *  HTML / SVG string-template output. Use for any user-data field that
 *  lands inside a template literal producing HTML or SVG. */
export function escHtml(s: string | number | undefined | null): string {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!)
  );
}

/** Escape a string for a YAML double-quoted scalar. Wraps in quotes if the
 *  input contains any YAML-special character or leading/trailing
 *  whitespace; escapes backslash, double-quote, newline, and carriage
 *  return inside the quoted form. */
export function escYaml(s: string): string {
  if (/[:"'\[\]{},&*#?|>!%@`\n\r]/.test(s) || /^\s|\s$/.test(s)) {
    return '"' + s
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r') + '"';
  }
  return s;
}

/** Parse a free-form internet-speed string like "1Gbps available", "100Mbps+",
 *  "500 Mbps fiber" into a Mbps number. Returns 10 as a conservative
 *  default when the string has no parseable number. */
export function parseSpeedToMbps(raw: string | undefined | null): number {
  if (!raw) return 10;
  const s = String(raw);
  const match = s.match(/(\d+(?:\.\d+)?)\s*(G|M)?/i);
  if (!match) return 10;
  const n = parseFloat(match[1]!);
  const unit = (match[2] ?? 'M').toUpperCase();
  return unit === 'G' ? n * 1000 : n;
}
