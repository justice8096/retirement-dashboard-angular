import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, of, tap } from 'rxjs';
import { environment } from '../../environments/environment';

export interface GlossaryEntry {
  key: string;
  term: string;
  aliases: string[];
  plain: string;
  example: string;
  technical: string;
  seeAlso: string[];
}

interface GlossaryResponse {
  terms: GlossaryEntry[];
  count: number;
}

/**
 * Fetches and caches `/api/glossary`. Used by tooltips, glossary screen,
 * and inline term definitions across the app. Addresses Dashboard
 * Dyscalculia F-007 / F-010.
 */
@Injectable({ providedIn: 'root' })
export class GlossaryService {
  private readonly http = inject(HttpClient);
  readonly terms = signal<GlossaryEntry[]>([]);
  readonly loaded = signal(false);

  private readonly endpoint =
    (environment as unknown as { apiUrl?: string }).apiUrl ?? '';

  /** Load the full glossary. Safe to call multiple times — no-ops once loaded. */
  load(): void {
    if (this.loaded()) return;
    this.http
      .get<GlossaryResponse>(`${this.endpoint}/api/glossary`)
      .pipe(
        tap((res) => {
          this.terms.set(res.terms ?? []);
          this.loaded.set(true);
        }),
        catchError(() => {
          this.loaded.set(true); // treat as loaded-but-empty
          return of(null);
        }),
      )
      .subscribe();
  }

  /** Look up a term by its canonical key or any alias. */
  find(keyOrAlias: string): GlossaryEntry | undefined {
    const needle = keyOrAlias.trim().toLowerCase();
    return this.terms().find(
      (t) =>
        t.key.toLowerCase() === needle ||
        t.term.toLowerCase() === needle ||
        t.aliases.some((a) => a.toLowerCase() === needle),
    );
  }
}
