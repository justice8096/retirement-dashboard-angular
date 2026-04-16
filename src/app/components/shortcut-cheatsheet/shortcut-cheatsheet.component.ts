import { Component, EventEmitter, Output, HostListener } from '@angular/core';

/**
 * Keyboard shortcut cheatsheet — opened with `?`, closed with Esc or click-outside.
 * Addresses Dashboard Dyslexia F-012 (shortcut discoverability).
 */
@Component({
  selector: 'app-shortcut-cheatsheet',
  standalone: true,
  template: `
    <div class="backdrop" (click)="close.emit()" role="presentation">
      <div class="panel"
           role="dialog"
           aria-modal="true"
           aria-labelledby="shortcut-title"
           (click)="$event.stopPropagation()">
        <header class="header">
          <h2 id="shortcut-title">Keyboard Shortcuts</h2>
          <button type="button" class="close" (click)="close.emit()" aria-label="Close">×</button>
        </header>

        <section>
          <h3>Accessibility</h3>
          <dl>
            <dt><kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>A</kbd></dt>
            <dd>Toggle accessibility panel</dd>
            <dt><kbd>?</kbd></dt>
            <dd>Show this cheatsheet</dd>
            <dt><kbd>Esc</kbd></dt>
            <dd>Close dialogs &amp; panels</dd>
          </dl>
        </section>

        <section>
          <h3>Navigation</h3>
          <dl>
            <dt><kbd>Tab</kbd> / <kbd>Shift</kbd> + <kbd>Tab</kbd></dt>
            <dd>Move focus between controls</dd>
            <dt><kbd>Enter</kbd></dt>
            <dd>Activate focused button or link</dd>
            <dt><kbd>Space</kbd></dt>
            <dd>Toggle checkboxes &amp; switches</dd>
          </dl>
        </section>

        <section>
          <h3>Reading</h3>
          <dl>
            <dt><kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>R</kbd></dt>
            <dd>Read current screen (when read-aloud is enabled)</dd>
          </dl>
        </section>
      </div>
    </div>
  `,
  styles: [`
    .backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.65);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .panel {
      background: var(--dark-bg-card);
      border: 1px solid var(--dark-border);
      border-radius: 12px;
      max-width: 520px;
      width: 100%;
      max-height: 80vh;
      overflow-y: auto;
      padding: 20px 24px;
      font-family: var(--app-font-family, var(--font-sans));
      color: var(--dark-text);
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--dark-border);
      padding-bottom: 10px;
      margin-bottom: 14px;
    }
    h2 {
      font-size: 18px;
      margin: 0;
      color: var(--dark-text);
    }
    .close {
      background: transparent;
      border: none;
      color: var(--dark-text-sec);
      font-size: 24px;
      cursor: pointer;
      padding: 2px 8px;
      border-radius: 4px;
      line-height: 1;
    }
    .close:hover { background: var(--dark-bg-secondary); color: var(--dark-text); }
    section { margin-bottom: 16px; }
    h3 {
      font-size: 14px;
      color: var(--dark-text-sec);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin: 0 0 8px;
      font-weight: 600;
    }
    dl {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 6px 12px;
      margin: 0;
    }
    dt {
      font-size: 14px;
      white-space: nowrap;
    }
    dd {
      font-size: 14px;
      color: var(--dark-text-sec);
      line-height: 1.5;
      margin: 0;
    }
    kbd {
      display: inline-block;
      padding: 2px 6px;
      font-size: 12px;
      font-weight: 600;
      color: var(--dark-text);
      background: var(--dark-bg-secondary);
      border: 1px solid var(--dark-border);
      border-radius: 4px;
      box-shadow: 0 1px 0 rgba(255, 255, 255, 0.05);
    }
  `],
})
export class ShortcutCheatsheetComponent {
  @Output() close = new EventEmitter<void>();

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close.emit();
  }
}
