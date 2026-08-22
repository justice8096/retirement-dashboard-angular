import { Component, computed, input, signal, HostListener, ChangeDetectionStrategy } from '@angular/core';
import { Source } from '@models/api.model';

/**
 * Info-icon that reveals a small popover listing source citations for a
 * nearby value. When `sources` is empty/missing, renders a muted "?" badge
 * — makes uncited values visible rather than invisible (Todos #11).
 *
 *   <app-source-tooltip [sources]="acaApplicablePctSources" />
 */
@Component({
  selector: 'app-source-tooltip',
  standalone: true,
  template: `
    <span class="wrap">
      <button
        type="button"
        class="icon"
        [class.muted]="!hasSources()"
        [attr.aria-label]="ariaLabel()"
        [attr.aria-expanded]="open()"
        (click)="toggle($event)">{{ hasSources() ? 'ⓘ' : '?' }}</button>
      @if (open()) {
        <div class="panel"
             role="dialog"
             [attr.aria-label]="hasSources() ? 'Sources' : 'No source'"
             (click)="$event.stopPropagation()">
          @if (hasSources()) {
            <div class="title">{{ label() || 'Sources' }}</div>
            <ul>
              @for (s of sources(); track $index) {
                <li>
                  <a [href]="s.url" target="_blank" rel="noopener noreferrer">{{ s.title }}</a>
                  @if (s.accessed) {
                    <span class="accessed"> · verified {{ s.accessed }}</span>
                  }
                </li>
              }
            </ul>
          } @else {
            <div class="empty">No citation yet — value is unsourced.</div>
          }
        </div>
      }
    </span>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .wrap {
      position: relative;
      display: inline-block;
      line-height: 1;
      vertical-align: baseline;
    }
    .icon {
      background: transparent;
      border: none;
      color: var(--dark-text-sec, #9aa);
      font-size: calc(12px * var(--font-scale, 1));
      cursor: pointer;
      padding: 0 4px;
      border-radius: 3px;
      line-height: 1;
    }
    .icon:hover { color: var(--dark-text, #eee); background: var(--dark-bg-secondary, rgba(255,255,255,0.06)); }
    .icon:focus-visible {
      outline: 2px solid var(--accent, #6aa);
      outline-offset: 1px;
    }
    .icon.muted {
      color: var(--warning-muted, #a86);
      opacity: 0.65;
    }
    .icon.muted:hover { opacity: 1; }

    .panel {
      position: absolute;
      top: calc(100% + 4px);
      left: 0;
      z-index: 9980;
      min-width: 240px;
      max-width: 380px;
      padding: 10px 12px;
      background: var(--dark-bg-card, #1b1f24);
      color: var(--dark-text, #eee);
      border: 1px solid var(--dark-border, #2a2f36);
      border-radius: 6px;
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4);
      font-size: calc(12px * var(--font-scale, 1));
      line-height: 1.35;
      animation: fadein 100ms ease-out;
    }
    @keyframes fadein {
      from { transform: translateY(-2px); opacity: 0; }
      to   { transform: translateY(0);    opacity: 1; }
    }
    .title {
      font-size: calc(10px * var(--font-scale, 1));
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--dark-text-muted, #888);
      margin-bottom: 6px;
    }
    ul {
      list-style: disc;
      padding-left: 18px;
      margin: 0;
    }
    li + li { margin-top: 4px; }
    a {
      color: var(--accent, #6aa);
      text-decoration: underline;
      word-break: break-word;
    }
    a:hover { color: var(--accent-hover, #8cc); }
    .accessed {
      color: var(--dark-text-muted, #888);
      font-size: calc(11px * var(--font-scale, 1));
    }
    .empty {
      font-style: italic;
      color: var(--dark-text-muted, #888);
    }
  `]
})
export class SourceTooltipComponent {
  readonly sources = input<Source[] | undefined>(undefined);
  /** Optional heading inside the popover; defaults to "Sources". */
  readonly label = input<string>('');

  readonly open = signal(false);
  readonly hasSources = computed(() => (this.sources()?.length ?? 0) > 0);
  readonly ariaLabel = computed(() => {
    const n = this.sources()?.length ?? 0;
    if (!n) return 'No source yet';
    return `${n} source${n === 1 ? '' : 's'} — click to view`;
  });

  toggle(evt: Event) {
    evt.stopPropagation();
    this.open.update(v => !v);
  }

  @HostListener('document:click')
  onDocClick() {
    if (this.open()) this.open.set(false);
  }

  @HostListener('document:keydown.escape')
  onEsc() {
    if (this.open()) this.open.set(false);
  }
}
