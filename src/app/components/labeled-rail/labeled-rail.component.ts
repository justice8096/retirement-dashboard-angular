import { Component, inject, ElementRef, QueryList, ViewChildren, AfterViewInit, OnDestroy, ChangeDetectionStrategy } from '@angular/core';
import { FocusMonitor } from '@angular/cdk/a11y';
import { NavigationService } from '@services/navigation.service';

@Component({
  selector: 'app-labeled-rail',
  standalone: true,
  template: `
    <nav aria-label="Main navigation" class="rail">
      @for (cat of nav.categories(); track cat.id) {
        <button #catBtn
          (click)="nav.selectCategory(cat.id)"
          [attr.aria-current]="nav.activeCatId() === cat.id ? 'true' : null"
          class="cat-btn"
          [class.active]="nav.activeCatId() === cat.id"
          [style.fontSize.px]="fontSize">
          <span class="cat-icon" [style.fontSize.px]="fontSize + 4">{{ cat.icon }}</span>
          <span class="cat-label">{{ cat.label }}</span>
          @if (hasNewBadge(cat)) {
            <span class="new-badge">NEW</span>
          }
        </button>
      }

      <div class="spacer"></div>

      <button aria-label="Accessibility settings"
        (click)="nav.toggleA11yPanel()"
        class="a11y-btn"
        [style.fontSize.px]="fontSize">
        <span [style.fontSize.px]="fontSize + 4">♿</span>
        <span>Accessibility</span>
      </button>
    </nav>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .rail {
      width: 180px;
      background: var(--dark-bg-secondary);
      border-right: 1px solid var(--dark-border);
      display: flex;
      flex-direction: column;
      padding-top: 8px;
      gap: 2px;
      flex-shrink: 0;
      overflow-y: auto;
    }
    .cat-btn {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      margin: 0 6px;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      text-align: left;
      outline: none;
      min-height: 44px;
      background: transparent;
      color: var(--dark-text-sec);
      font-weight: 500;
      border-left: 3px solid transparent;
      transition: all 0.15s ease;
      &.active {
        background: var(--dark-bg-card);
        color: var(--dark-text);
        font-weight: 700;
        border-left-color: var(--dark-amber);
      }
      &.cdk-keyboard-focused {
        outline: 2px solid var(--dark-blue);
        outline-offset: 2px;
      }
    }
    .cat-icon { flex-shrink: 0; }
    .cat-label { flex: 1; }
    .new-badge {
      font-size: 8px;
      background: var(--dark-amber);
      color: #000;
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: 700;
    }
    .spacer { flex: 1; }
    .a11y-btn {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      margin: 0 6px;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      text-align: left;
      background: transparent;
      color: var(--dark-text-muted);
      margin-bottom: 8px;
      min-height: 44px;
      transition: all 0.15s ease;
      &:hover { color: var(--dark-text-sec); }
      &.cdk-keyboard-focused {
        outline: 2px solid var(--dark-blue);
        outline-offset: 2px;
      }
    }
  `],
})
export class LabeledRailComponent implements AfterViewInit, OnDestroy {
  readonly nav = inject(NavigationService);
  private readonly focusMonitor = inject(FocusMonitor);

  @ViewChildren('catBtn') catButtons!: QueryList<ElementRef>;

  get fontSize(): number {
    const map = { normal: 13, large: 15, xlarge: 17 };
    return map[this.nav.fontSize()];
  }

  ngAfterViewInit(): void {
    this.catButtons.forEach(btn => this.focusMonitor.monitor(btn));
  }

  ngOnDestroy(): void {
    this.catButtons.forEach(btn => this.focusMonitor.stopMonitoring(btn));
  }

  hasNewBadge(cat: { screens: { badge?: string }[] }): boolean {
    return cat.screens.some(s => !!s.badge);
  }
}
