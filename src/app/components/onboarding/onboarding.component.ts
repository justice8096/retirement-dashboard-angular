import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { NavigationService } from '@services/navigation.service';
import { NavMode, FontSize, FONT_SIZES } from '@models/navigation.model';

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [MatButtonModule, MatChipsModule],
  template: `
    <div class="onboarding-page">
      <div class="card">

        <!-- Step indicator -->
        <div class="step-row">
          @for (step of [1, 2, 3, 4]; track step) {
            <div class="step-item">
              <div class="step-circle"
                [class.done]="step < 3"
                [class.current]="step === 3"
                [class.future]="step > 3"
                [attr.aria-label]="'Step ' + step + (step < 3 ? ' completed' : step === 3 ? ' current' : ' upcoming')">
                {{ step < 3 ? '✓' : step }}
              </div>
              @if (step < 4) {
                <div class="step-line" [class.done]="step < 3"></div>
              }
            </div>
          }
          <span class="step-label">Step 3 of 4 — Navigation Preference</span>
        </div>

        <!-- Heading -->
        <h2 class="heading" [style.fontSize.px]="currentBase() + 8">
          How would you like to navigate?
        </h2>
        <p class="subheading" [style.fontSize.px]="currentBase()">
          Choose the navigation style that works best for you.
          You can change this anytime in Settings.
        </p>

        <!-- Font size picker -->
        <div class="font-picker">
          <span class="font-picker-label" [style.fontSize.px]="currentBase() - 1">Text size:</span>
          <mat-chip-listbox
            aria-label="Text size"
            [value]="fontSize()"
            (change)="fontSize.set($event.value)">
            @for (entry of fontSizeEntries; track entry.key) {
              <mat-chip-option [value]="entry.key">{{ entry.label }}</mat-chip-option>
            }
          </mat-chip-listbox>
        </div>

        <!-- Option cards -->
        <div class="options-grid" role="radiogroup" aria-label="Navigation style">
          <!-- Compact -->
          <button (click)="selected.set('compact')"
            role="radio"
            [attr.aria-checked]="selected() === 'compact'"
            class="option-card"
            [class.selected]="selected() === 'compact'">
            <div class="option-title" [style.fontSize.px]="currentBase() + 4">Compact</div>
            <div class="option-desc" [style.fontSize.px]="currentBase() - 1">
              Small icon sidebar — maximizes space for charts and data.
            </div>
            <div class="preview">
              <div class="preview-sidebar-compact">
                @for (icon of previewIcons; track icon; let i = $index) {
                  <div class="preview-icon" [class.active]="i === 1">{{ icon }}</div>
                }
              </div>
              <div class="preview-content">
                <div class="preview-chart-grid">
                  @for (c of previewColors; track c; let i = $index) {
                    <div class="preview-bar"
                      [style.background]="c"
                      [style.opacity]="0.15 + (i === 0 ? 0.25 : 0)"></div>
                  }
                </div>
              </div>
            </div>
          </button>

          <!-- Labeled -->
          <button (click)="selected.set('expanded')"
            role="radio"
            [attr.aria-checked]="selected() === 'expanded'"
            class="option-card"
            [class.selected]="selected() === 'expanded'">
            <div class="option-title" [style.fontSize.px]="currentBase() + 4">Labeled</div>
            <div class="a11y-rec">RECOMMENDED FOR ACCESSIBILITY</div>
            <div class="option-desc" [style.fontSize.px]="currentBase() - 1">
              Full labels — every section clearly named.
            </div>
            <div class="preview">
              <div class="preview-sidebar-labeled">
                @for (lbl of previewLabels; track lbl; let i = $index) {
                  <div class="preview-label-item" [class.active]="i === 1">{{ lbl }}</div>
                }
              </div>
              <div class="preview-content">
                <div class="preview-chart-grid">
                  @for (c of previewColors; track c; let i = $index) {
                    <div class="preview-bar"
                      [style.background]="c"
                      [style.opacity]="0.15 + (i === 0 ? 0.25 : 0)"></div>
                  }
                </div>
              </div>
            </div>
          </button>
        </div>

        <!-- Confirm -->
        <button mat-flat-button
          (click)="confirm()"
          [disabled]="!selected()"
          class="confirm-btn"
          [class.ready]="!!selected()"
          [style.fontSize.px]="currentBase() + 2">
          {{ selected()
            ? 'Continue with ' + (selected() === 'compact' ? 'Compact' : 'Labeled') + ' navigation →'
            : 'Select a style above' }}
        </button>
      </div>
    </div>
  `,
  styles: [`
    .onboarding-page {
      min-height: 100vh;
      background: var(--dark-bg);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      font-family: var(--font-sans);
    }
    .card {
      max-width: 700px;
      width: 100%;
      background: var(--dark-bg-card);
      border: 1px solid var(--dark-border);
      border-radius: 16px;
      padding: 40px;
    }

    .step-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 32px;
    }
    .step-item {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .step-circle {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 700;
      &.done { background: var(--dark-green); color: #000; }
      &.current { background: var(--dark-amber); color: #000; }
      &.future { background: var(--dark-bg-secondary); color: var(--dark-text-muted); }
    }
    .step-line {
      width: 40px;
      height: 2px;
      background: var(--dark-border);
      &.done { background: var(--dark-green); }
    }
    .step-label {
      margin-left: 8px;
      font-size: 11px;
      color: var(--dark-text-sec);
    }

    .heading {
      color: var(--dark-amber);
      font-weight: 700;
      margin-bottom: 8px;
    }
    .subheading {
      color: var(--dark-text-sec);
      line-height: 1.5;
      margin-bottom: 8px;
    }

    .font-picker {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 24px;
      padding: 10px 14px;
      background: var(--dark-bg-secondary);
      border-radius: 8px;
      border: 1px solid var(--dark-border);
    }
    .font-picker-label {
      color: var(--dark-text-sec);
    }

    :host ::ng-deep {
      .font-picker .mat-mdc-chip-option {
        --mat-chip-elevated-container-color: transparent;
        --mat-chip-label-text-color: var(--dark-text-sec);
        --mat-chip-elevated-selected-container-color: var(--dark-blue);
        --mat-chip-selected-label-text-color: #fff;
        --mat-chip-container-height: 28px;
        font-family: var(--font-sans);
      }
    }

    .options-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-bottom: 28px;
    }
    .option-card {
      background: var(--dark-bg-secondary);
      border-radius: 12px;
      padding: 20px;
      cursor: pointer;
      text-align: left;
      border: 3px solid var(--dark-border);
      transition: border-color 0.2s;
      &.selected {
        border-color: var(--dark-blue);
        outline: 2px solid var(--dark-blue);
      }
      &:focus-visible {
        outline: 2px solid var(--dark-blue);
        outline-offset: 2px;
      }
    }
    .option-title {
      font-weight: 700;
      color: var(--dark-text);
      margin-bottom: 8px;
    }
    .a11y-rec {
      font-size: 9px;
      color: var(--dark-green);
      font-weight: 700;
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .option-desc {
      color: var(--dark-text-sec);
      line-height: 1.5;
      margin-bottom: 16px;
    }

    .preview {
      display: flex;
      background: var(--dark-bg);
      border-radius: 8px;
      overflow: hidden;
      height: 100px;
      border: 1px solid var(--dark-border);
    }
    .preview-sidebar-compact {
      width: 36px;
      background: var(--dark-bg-secondary);
      display: flex;
      flex-direction: column;
      align-items: center;
      padding-top: 6px;
      gap: 4px;
      border-right: 1px solid var(--dark-border);
    }
    .preview-icon {
      width: 22px;
      height: 22px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      border-left: 2px solid transparent;
      &.active {
        background: var(--dark-bg-card);
        border-left-color: var(--dark-amber);
      }
    }
    .preview-sidebar-labeled {
      width: 80px;
      background: var(--dark-bg-secondary);
      display: flex;
      flex-direction: column;
      padding-top: 6px;
      gap: 2px;
      border-right: 1px solid var(--dark-border);
    }
    .preview-label-item {
      padding: 2px 6px;
      font-size: 7px;
      display: flex;
      align-items: center;
      gap: 2px;
      border-radius: 4px;
      margin: 0 2px;
      color: var(--dark-text-muted);
      border-left: 2px solid transparent;
      &.active {
        background: var(--dark-bg-card);
        color: var(--dark-text);
        font-weight: 700;
        border-left-color: var(--dark-amber);
      }
    }
    .preview-content {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 8px;
    }
    .preview-chart-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4px;
      width: 100%;
    }
    .preview-bar {
      height: 16px;
      border-radius: 4px;
    }

    .confirm-btn {
      width: 100%;
      min-height: 48px;
      border-radius: 12px;
      font-weight: 700;
      --mat-button-filled-container-color: var(--dark-bg-secondary);
      --mat-button-filled-label-text-color: var(--dark-text-muted);
      &.ready {
        --mat-button-filled-container-color: var(--dark-amber);
        --mat-button-filled-label-text-color: #000;
      }
    }
  `],
})
export class OnboardingComponent {
  private readonly nav = inject(NavigationService);

  readonly selected = signal<NavMode | null>(null);
  readonly fontSize = signal<FontSize>('normal');

  readonly fontSizeEntries = Object.entries(FONT_SIZES).map(
    ([key, val]) => ({ key: key as FontSize, ...val })
  );

  readonly currentBase = () => FONT_SIZES[this.fontSize()].base;

  readonly previewIcons = ['⚙️', '📍', '💰', '📊', '🎲', '🏘️'];
  readonly previewLabels = ['⚙️ Setup', '📍 Locations', '💰 Costs', '📊 Income', '🎲 Simulate'];
  readonly previewColors = ['#D4943A', '#5C9CE6', '#4CAF50', '#9C6FDE'];

  confirm(): void {
    const mode = this.selected();
    if (mode) {
      this.nav.completeOnboarding(mode, this.fontSize());
    }
  }
}
