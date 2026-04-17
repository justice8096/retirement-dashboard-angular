import { Injectable, inject, signal, computed } from '@angular/core';
import { NavigationService } from '@services/navigation.service';
import { HELP_CONTENT, HELP_FALLBACK } from '@content/help-content';
import { HelpEntry } from '@models/help.model';

/**
 * Per-screen help state. The drawer is a single app-level surface that
 * looks up content by the active `screenId`.
 *
 * Open via:
 *   - the `?` button in the context-bar
 *   - `F1` keyboard shortcut
 *
 * Close via:
 *   - close button
 *   - Esc
 *   - click outside the drawer
 */
@Injectable({ providedIn: 'root' })
export class HelpService {
  private readonly nav = inject(NavigationService);

  readonly open = signal(false);

  readonly entry = computed<HelpEntry>(() => {
    const screenId = this.nav.activeScreenId();
    return HELP_CONTENT[screenId] ?? HELP_FALLBACK;
  });

  toggle(): void {
    this.open.update((v) => !v);
  }

  show(): void {
    this.open.set(true);
  }

  hide(): void {
    this.open.set(false);
  }
}
