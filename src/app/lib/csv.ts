/**
 * RFC 4180-ish CSV encoding helpers, shared by any screen that builds a CSV
 * download client-side. Extracted so the escaping rules are unit-tested in
 * isolation instead of re-implemented ad hoc per export button.
 *
 * Field separator: comma. Row separator: LF (`\n`) — RFC 4180 specifies
 * CRLF, but LF is universally accepted by spreadsheet apps and keeps the
 * output byte-identical to what a Node/browser string literal produces
 * without a CRLF-normalization step.
 *
 * Tests: `scripts/test-csv.mts` (Node built-in test runner, mirrors
 * `scripts/test-text-escape.mts`).
 */

/** Encode a single CSV field. Wraps in double quotes and doubles any
 *  embedded double-quote when the value contains a comma, a double-quote,
 *  or a line break (CR or LF) — the three conditions RFC 4180 requires
 *  quoting for. `null`/`undefined` render as an empty field. */
export function csvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  const s = typeof value === 'string' ? value : String(value);
  if (/[",\r\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/** Build a full CSV document from a header row and data rows. No trailing
 *  newline after the last row and no UTF-8 BOM — matches the retired React
 *  dashboard's `downloadCSV` helper (`new Blob([csv], { type: 'text/csv' })`
 *  with no BOM prefix), so files produced here are byte-for-byte comparable
 *  to what the old app shipped. */
export function toCsv(
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][],
): string {
  const lines = [
    headers.map(csvCell).join(','),
    ...rows.map(row => row.map(csvCell).join(',')),
  ];
  return lines.join('\n');
}
