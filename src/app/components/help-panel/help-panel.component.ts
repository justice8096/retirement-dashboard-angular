import { Component, inject, HostListener, computed, ChangeDetectionStrategy } from '@angular/core';
import { HelpService } from '@services/help.service';
import { NavigationService } from '@services/navigation.service';
import { DyslexiaService } from '@services/dyslexia.service';
import { GlossaryService, GlossaryEntry } from '@services/glossary.service';
import { CATEGORIES } from '@models/navigation.model';

/**
 * Slide-over drawer rendering screen-specific help. Accessible:
 *   - aria-modal + aria-labelledby on the panel
 *   - Esc / click-outside close
 *   - plain-language content chunks
 *   - optional read-aloud when dyslexia support is on
 *   - glossary terms link to /api/glossary via GlossaryService
 *   - "See also" links to sibling screens via NavigationService.selectScreen
 */
@Component({
  selector: 'app-help-panel',
  standalone: true,
  template: `
    <div class="backdrop" (click)="close()" role="presentation">
      <aside
        class="panel"
        role="dialog"
        aria-modal="true"
        [attr.aria-labelledby]="'help-title-' + entry().screenId"
        (click)="$event.stopPropagation()">
        <header class="header">
          <div>
            <div class="eyebrow">Help &amp; context</div>
            <h2 [id]="'help-title-' + entry().screenId">{{ entry().title }}</h2>
          </div>
          <div class="header-actions">
            @if (dyslexia.canReadAloud) {
              <button
                type="button"
                class="icon-btn"
                (click)="readAloud()"
                aria-label="Read this help aloud">
                🔊
              </button>
            }
            <button
              type="button"
              class="icon-btn"
              (click)="close()"
              aria-label="Close help">
              ×
            </button>
          </div>
        </header>

        <div class="scroll-body">
          <p class="summary">{{ entry().summary }}</p>

          @for (sec of entry().sections; track sec.heading) {
            <section class="section">
              <h3>{{ sec.heading }}</h3>
              @for (para of sec.body; track $index) {
                <p>{{ para }}</p>
              }
            </section>
          }

          @if (entry().tips?.length) {
            <section class="section tips">
              <h3>Tips</h3>
              <ul>
                @for (tip of entry().tips; track $index) {
                  <li>{{ tip }}</li>
                }
              </ul>
            </section>
          }

          @if (glossaryEntries().length) {
            <section class="section glossary">
              <h3>Key terms</h3>
              <div class="chips">
                @for (g of glossaryEntries(); track g.key) {
                  <details class="chip">
                    <summary>{{ g.term }}</summary>
                    <p class="chip-body">{{ g.plain }}</p>
                    @if (g.example) {
                      <p class="chip-example"><em>Example.</em> {{ g.example }}</p>
                    }
                  </details>
                }
              </div>
            </section>
          }

          @if (relatedScreens().length) {
            <section class="section related">
              <h3>See also</h3>
              <div class="related-list">
                @for (r of relatedScreens(); track r.id) {
                  <button type="button" class="related-btn" (click)="goTo(r.id, r.catId)">
                    {{ r.label }}
                  </button>
                }
              </div>
            </section>
          }
        </div>

        <footer class="footer">
          Press <kbd>Esc</kbd> to close · <kbd>F1</kbd> to reopen
        </footer>
      </aside>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 9990;
      display: flex;
      justify-content: flex-end;
    }
    .panel {
      width: min(480px, 92vw);
      height: 100%;
      background: var(--dark-bg-card);
      border-left: 1px solid var(--dark-border);
      box-shadow: -4px 0 16px rgba(0, 0, 0, 0.4);
      display: flex;
      flex-direction: column;
      font-family: var(--app-font-family, var(--font-sans));
      color: var(--dark-text);
      animation: slidein 150ms ease-out;
    }
    @keyframes slidein {
      from { transform: translateX(20px); opacity: 0; }
      to   { transform: translateX(0);    opacity: 1; }
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 20px 12px;
      border-bottom: 1px solid var(--dark-border);
    }
    .eyebrow {
      font-size: calc(11px * var(--font-scale, 1));
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--dark-text-muted);
    }
    h2 {
      font-size: calc(18px * var(--font-scale, 1));
      margin: 2px 0 0;
      color: var(--dark-text);
    }
    .header-actions {
      display: flex;
      gap: 4px;
    }
    .icon-btn {
      background: transparent;
      border: none;
      color: var(--dark-text-sec);
      font-size: calc(20px * var(--font-scale, 1));
      padding: 4px 10px;
      border-radius: 6px;
      cursor: pointer;
      line-height: 1;
    }
    .icon-btn:hover { background: var(--dark-bg-secondary); color: var(--dark-text); }

    .scroll-body {
      flex: 1;
      overflow-y: auto;
      padding: 16px 20px;
    }

    .summary {
      font-size: calc(15px * var(--font-scale, 1));
      color: var(--dark-text);
      padding: 10px 12px;
      background: rgba(92, 156, 230, 0.08);
      border-left: 3px solid var(--dark-blue);
      border-radius: 4px;
      line-height: var(--prose-line-height, 1.5);
      letter-spacing: var(--prose-letter-spacing, 0);
      word-spacing: var(--prose-word-spacing, 0);
      margin-bottom: 16px;
    }

    .section {
      margin-bottom: 20px;
    }
    .section h3 {
      font-size: calc(13px * var(--font-scale, 1));
      color: var(--dark-text-sec);
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin: 0 0 8px;
    }
    .section p {
      font-size: calc(14px * var(--font-scale, 1));
      color: var(--dark-text);
      line-height: var(--prose-line-height, 1.5);
      letter-spacing: var(--prose-letter-spacing, 0);
      word-spacing: var(--prose-word-spacing, 0);
      margin: 0 0 8px;
    }
    .section ul {
      margin: 0;
      padding-left: 18px;
    }
    .section li {
      font-size: calc(14px * var(--font-scale, 1));
      color: var(--dark-text);
      line-height: var(--prose-line-height, 1.5);
      margin-bottom: 6px;
    }
    .tips {
      background: rgba(212, 148, 58, 0.08);
      border-left: 3px solid var(--dark-amber);
      border-radius: 4px;
      padding: 10px 12px;
    }
    .tips h3 { color: var(--dark-amber); margin-top: 0; }

    .chips {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .chip {
      border: 1px solid var(--dark-border);
      border-radius: 6px;
      background: var(--dark-bg-secondary);
      padding: 6px 10px;
    }
    .chip summary {
      cursor: pointer;
      font-size: calc(14px * var(--font-scale, 1));
      font-weight: 600;
      color: var(--dark-text);
      list-style: none;
    }
    .chip summary::before {
      content: '+';
      margin-right: 6px;
      color: var(--dark-blue);
      font-weight: 700;
    }
    .chip[open] summary::before { content: '−'; }
    .chip-body,
    .chip-example {
      font-size: calc(14px * var(--font-scale, 1));
      color: var(--dark-text-sec);
      line-height: var(--prose-line-height, 1.5);
      letter-spacing: var(--prose-letter-spacing, 0);
      word-spacing: var(--prose-word-spacing, 0);
      margin: 6px 0 0;
    }
    .chip-example { color: var(--dark-text-muted); }

    .related-list {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .related-btn {
      padding: 6px 12px;
      border-radius: 9999px;
      border: 1px solid var(--dark-border);
      background: var(--dark-bg-secondary);
      color: var(--dark-text-sec);
      font-family: inherit;
      font-size: calc(14px * var(--font-scale, 1));
      cursor: pointer;
    }
    .related-btn:hover {
      background: var(--dark-blue);
      color: #fff;
      border-color: var(--dark-blue);
    }

    .footer {
      padding: 8px 20px;
      border-top: 1px solid var(--dark-border);
      font-size: calc(12px * var(--font-scale, 1));
      color: var(--dark-text-muted);
    }
    kbd {
      display: inline-block;
      padding: 1px 5px;
      font-size: calc(11px * var(--font-scale, 1));
      font-weight: 600;
      color: var(--dark-text);
      background: var(--dark-bg-secondary);
      border: 1px solid var(--dark-border);
      border-radius: 3px;
    }
  `],
})
export class HelpPanelComponent {
  readonly help = inject(HelpService);
  readonly dyslexia = inject(DyslexiaService);
  private readonly nav = inject(NavigationService);
  private readonly glossary = inject(GlossaryService);

  readonly entry = this.help.entry;

  readonly glossaryEntries = computed<GlossaryEntry[]>(() => {
    const keys = this.entry().glossaryKeys ?? [];
    if (!keys.length) return [];
    // Ensure glossary is loaded the first time we need it
    if (!this.glossary.loaded()) this.glossary.load();
    return keys
      .map((k) => this.glossary.find(k))
      .filter((g): g is GlossaryEntry => !!g);
  });

  readonly relatedScreens = computed(() => {
    const ids = this.entry().related ?? [];
    if (!ids.length) return [];
    const map = new Map<string, { id: string; label: string; catId: string }>();
    for (const cat of CATEGORIES) {
      for (const screen of cat.screens) {
        map.set(screen.id, { id: screen.id, label: screen.label, catId: cat.id });
      }
    }
    return ids
      .map((id) => map.get(id))
      .filter((r): r is { id: string; label: string; catId: string } => !!r);
  });

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close();
  }

  close(): void {
    this.help.hide();
  }

  goTo(screenId: string, catId: string): void {
    this.nav.selectCategory(catId);
    this.nav.selectScreen(screenId);
    this.help.hide();
  }

  readAloud(): void {
    const e = this.entry();
    const body = [
      e.title,
      e.summary,
      ...e.sections.flatMap((s) => [s.heading, ...s.body]),
      ...(e.tips ?? []),
    ].join('. ');
    this.dyslexia.readAloud(body);
  }
}
