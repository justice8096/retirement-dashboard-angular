/* ─── Source citations ────────────────────────────────────────────────
 * Every user-facing number / narrative claim in the app should carry a
 * clickable source. See Todos #11. Surfaced via <app-source-tooltip> info
 * icon. A missing/empty sources array renders a muted "no-citation-yet"
 * badge — makes gaps visible rather than invisible.
 */
export interface Source {
  /** Human-readable title — e.g. "Rev. Proc. 2025-32", "HHS FPL 2026", "Numbeo Lisbon Oct 2025". */
  title: string;
  /** Canonical URL for verification. */
  url: string;
  /** ISO date (YYYY-MM-DD) when the source was last verified. Supports link-rot audits. */
  accessed?: string;
}

/**
 * A pros/cons bullet — either a plain string (legacy) or an object carrying
 * citation sources alongside the text. Consumers should read via the
 * `bulletText` / `bulletSources` helpers below to stay agnostic of shape.
 */
export type ProConBullet = string | { text: string; sources?: Source[] };

export function bulletText(b: ProConBullet): string {
  return typeof b === 'string' ? b : b.text;
}

export function bulletSources(b: ProConBullet): Source[] | undefined {
  return typeof b === 'string' ? undefined : b.sources;
}

/* ─── Pagination ─────────────────────────────────────────────────────── */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
