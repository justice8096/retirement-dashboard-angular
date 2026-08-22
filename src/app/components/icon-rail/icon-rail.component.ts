import { Component, inject, ElementRef, QueryList, ViewChildren, AfterViewInit, OnDestroy, ChangeDetectionStrategy } from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FocusMonitor } from '@angular/cdk/a11y';
import { NavigationService } from '@services/navigation.service';

@Component({
  selector: 'app-icon-rail',
  standalone: true,
  imports: [MatTooltipModule],
  template: `
    <nav aria-label="Main navigation" class="rail">
      @for (cat of nav.categories(); track cat.id) {
        <button #catBtn
          (click)="nav.selectCategory(cat.id)"
          [attr.aria-label]="cat.label"
          [attr.aria-current]="nav.activeCatId() === cat.id ? 'true' : null"
          [matTooltip]="cat.label + (hasNewBadge(cat) ? ' — NEW' : '')"
          matTooltipPosition="right"
          matTooltipShowDelay="400"
          class="cat-btn"
          [class.active]="nav.activeCatId() === cat.id">
          {{ cat.icon }}
          @if (hasNewBadge(cat)) {
            <div class="new-dot"></div>
          }
        </button>
      }

      <div class="spacer"></div>

      <button aria-label="Accessibility settings"
        (click)="nav.toggleA11yPanel()"
        matTooltip="Accessibility settings"
        matTooltipPosition="right"
        class="a11y-btn">
        ♿
      </button>
    </nav>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .rail {
      width: 52px;
      background: var(--dark-bg-secondary);
      border-right: 1px solid var(--dark-border);
      display: flex;
      flex-direction: column;
      align-items: center;
      padding-top: 8px;
      gap: 2px;
      flex-shrink: 0;
    }
    .cat-btn {
      width: 40px;
      height: 40px;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-size: calc(18px * var(--font-scale, 1));
      display: flex;
      align-items: center;
      justify-content: center;
      outline: none;
      position: relative;
      transition: all 0.15s ease;
      background: transparent;
      border-left: 3px solid transparent;
      &.active {
        background: var(--dark-bg-card);
        border-left-color: var(--dark-amber);
      }
      &.cdk-keyboard-focused {
        outline: 2px solid var(--dark-blue);
        outline-offset: 2px;
      }
    }
    .new-dot {
      position: absolute;
      top: 4px;
      right: 4px;
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--dark-amber);
    }
    .spacer { flex: 1; }
    .a11y-btn {
      width: 40px;
      height: 40px;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-size: calc(16px * var(--font-scale, 1));
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      color: var(--dark-text-muted);
      margin-bottom: 8px;
      transition: all 0.15s ease;
      &:hover { color: var(--dark-text-sec); }
      &.cdk-keyboard-focused {
        outline: 2px solid var(--dark-blue);
        outline-offset: 2px;
      }
    }
  `],
})
export class IconRailComponent implements AfterViewInit, OnDestroy {
  readonly nav = inject(NavigationService);
  private readonly focusMonitor = inject(FocusMonitor);

  @ViewChildren('catBtn') catButtons!: QueryList<ElementRef>;

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
