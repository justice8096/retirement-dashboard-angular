import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { NavigationService } from '@services/navigation.service';
import { HelpService } from '@services/help.service';

@Component({
  selector: 'app-context-bar',
  standalone: true,
  template: `
    @if (nav.activeCat(); as cat) {
      <div role="tablist" [attr.aria-label]="cat.label + ' sub-sections'" class="bar">
        <span class="cat-title" [style.fontSize.px]="fontSize">
          {{ cat.icon }} {{ cat.label }}
        </span>
        <span class="divider" [style.fontSize.px]="fontSize">|</span>

        @for (screen of cat.screens; track screen.id) {
          <button role="tab"
            [attr.aria-selected]="nav.activeScreenId() === screen.id"
            (click)="nav.selectScreen(screen.id)"
            class="tab-btn"
            [class.active]="nav.activeScreenId() === screen.id"
            [style.fontSize.px]="fontSize">
            {{ screen.label }}
            @if (screen.badge) {
              <span class="badge">{{ screen.badge }}</span>
            }
            @if (screen.tier === 'premium') {
              <span class="lock">🔒</span>
            }
          </button>
        }

        <span class="spacer"></span>

        <!-- Screen-specific help (F1 / ?) -->
        <button
          type="button"
          class="help-btn"
          [class.active]="help.open()"
          (click)="help.toggle()"
          [attr.aria-expanded]="help.open()"
          [attr.aria-label]="'Help for ' + (nav.activeCat()?.label ?? '') + ' — ' + nav.activeScreenId()"
          [style.fontSize.px]="fontSize"
          title="Help for this page (F1)">
          <span aria-hidden="true">?</span>
          <span class="help-label">Help</span>
        </button>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .bar {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      background: var(--dark-bg-secondary);
      border-bottom: 1px solid var(--dark-border);
      flex-wrap: wrap;
    }
    .cat-title {
      font-weight: 700;
      color: var(--dark-amber);
      margin-right: 4px;
    }
    .divider {
      color: var(--dark-text-muted);
    }
    .tab-btn {
      padding: 6px 14px;
      border-radius: 9999px;
      border: none;
      cursor: pointer;
      min-height: 32px;
      outline: none;
      background: transparent;
      color: var(--dark-text-sec);
      transition: all 0.15s ease;
      &.active {
        background: var(--dark-blue);
        color: #fff;
        font-weight: 700;
      }
    }
    .badge {
      margin-left: 6px;
      font-size: calc(8px * var(--font-scale, 1));
      background: var(--dark-amber);
      color: #000;
      padding: 2px 4px;
      border-radius: 2px;
      font-weight: 700;
    }
    .lock {
      margin-left: 4px;
      font-size: calc(10px * var(--font-scale, 1));
    }

    .spacer { flex: 1; min-width: 8px; }

    .help-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: 9999px;
      border: 1px solid var(--dark-border);
      background: transparent;
      color: var(--dark-text-sec);
      font-family: inherit;
      font-weight: 600;
      min-height: 32px;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .help-btn:hover {
      background: var(--dark-bg-card);
      color: var(--dark-text);
      border-color: var(--dark-blue);
    }
    .help-btn.active {
      background: var(--dark-blue);
      color: #fff;
      border-color: var(--dark-blue);
    }
    .help-btn .help-label {
      font-size: calc(14px * var(--font-scale, 1));
    }
    @media (max-width: 520px) {
      .help-btn .help-label { display: none; }
    }
  `],
})
export class ContextBarComponent {
  readonly nav = inject(NavigationService);
  readonly help = inject(HelpService);

  get fontSize(): number {
    const map = { normal: 12, large: 13, xlarge: 15 };
    return map[this.nav.fontSize()];
  }
}
