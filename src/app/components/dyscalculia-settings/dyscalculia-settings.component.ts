import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatChipsModule, MatChipListboxChange } from '@angular/material/chips';
import { LiveAnnouncer } from '@angular/cdk/a11y';
import { DyscalculiaService } from '@services/dyscalculia.service';
import {
  NumberFormat,
  PercentageDisplay,
  ChartStyle,
  NumberSpacing,
  ProgressStyle,
} from '@models/dyscalculia.model';

@Component({
  selector: 'app-dyscalculia-settings',
  standalone: true,
  imports: [MatSlideToggleModule, MatChipsModule],
  template: `
    <div class="scroll-area">

      <!-- Master toggle -->
      <div class="master-toggle" [class.enabled]="dyscalculia.isEnabled()">
        <div class="toggle-info">
          <span class="toggle-title">Dyscalculia Support</span>
          <p class="toggle-desc">
            Adapts how numbers, percentages, and data visualizations are displayed throughout the dashboard
          </p>
        </div>
        <mat-slide-toggle
          [checked]="dyscalculia.isEnabled()"
          (change)="onMasterToggle($event.checked)"
          aria-label="Dyscalculia Support" />
      </div>

      @if (dyscalculia.isEnabled()) {
        <!-- Number Display -->
        <div class="section">
          <span class="section-label">Number Display</span>
          <mat-chip-listbox
            aria-label="Number display format"
            [value]="dyscalculia.settings().numberFormat"
            (change)="onChipChange('numberFormat', $event, 'Number Display')">
            @for (opt of numberFormatOptions; track opt.value) {
              <mat-chip-option [value]="opt.value">{{ opt.label }}</mat-chip-option>
            }
          </mat-chip-listbox>
          <p class="desc">
            Spaced format reduces visual crowding. Word format provides a plain-language alternative.
          </p>
        </div>

        <!-- Digit Spacing -->
        <div class="section">
          <span class="section-label">Digit Spacing</span>
          <mat-chip-listbox
            aria-label="Digit spacing"
            [value]="dyscalculia.settings().numberSpacing"
            (change)="onChipChange('numberSpacing', $event, 'Digit Spacing')">
            @for (opt of spacingOptions; track opt.value) {
              <mat-chip-option [value]="opt.value">{{ opt.label }}</mat-chip-option>
            }
          </mat-chip-listbox>
          <p class="desc">
            Wider spacing between digits helps reduce transposition errors and visual crowding.
          </p>
        </div>

        <!-- Round Numbers -->
        <div class="section">
          <div class="toggle-row">
            <div class="toggle-info">
              <span class="toggle-title">Round Numbers</span>
              <p class="desc">Rounds dollar amounts to the nearest $100 — removes unnecessary decimal precision</p>
            </div>
            <mat-slide-toggle
              [checked]="dyscalculia.settings().roundNumbers"
              (change)="onToggle('roundNumbers', $event.checked, 'Round Numbers')"
              aria-label="Round Numbers" />
          </div>
        </div>

        <!-- Percentage Display -->
        <div class="section">
          <span class="section-label">Percentage Display</span>
          <mat-chip-listbox
            aria-label="Percentage display format"
            [value]="dyscalculia.settings().percentageDisplay"
            (change)="onChipChange('percentageDisplay', $event, 'Percentage Display')">
            @for (opt of percentageOptions; track opt.value) {
              <mat-chip-option [value]="opt.value">{{ opt.label }}</mat-chip-option>
            }
          </mat-chip-listbox>
          <p class="desc">
            Natural frequencies ("1 in 4") are easier to understand than abstract percentages for many people.
          </p>
        </div>

        <!-- Text Summaries -->
        <div class="section">
          <div class="toggle-row">
            <div class="toggle-info">
              <span class="toggle-title">Text Summaries</span>
              <p class="desc">Shows a plain-language description below each number so meaning doesn't depend on reading digits</p>
            </div>
            <mat-slide-toggle
              [checked]="dyscalculia.settings().showTextSummaries"
              (change)="onToggle('showTextSummaries', $event.checked, 'Text Summaries')"
              aria-label="Text Summaries" />
          </div>
        </div>

        <!-- Real-World Comparisons -->
        <div class="section">
          <div class="toggle-row">
            <div class="toggle-info">
              <span class="toggle-title">Real-World Comparisons</span>
              <p class="desc">Adds everyday spending comparisons to dollar amounts (e.g. 'similar to median US household spending')</p>
            </div>
            <mat-slide-toggle
              [checked]="dyscalculia.settings().magnitudeAnchors"
              (change)="onToggle('magnitudeAnchors', $event.checked, 'Real-World Comparisons')"
              aria-label="Real-World Comparisons" />
          </div>
        </div>

        <!-- Chart Style -->
        <div class="section">
          <span class="section-label">Chart Style</span>
          <mat-chip-listbox
            aria-label="Chart style"
            [value]="dyscalculia.settings().chartStyle"
            (change)="onChipChange('chartStyle', $event, 'Chart Style')">
            @for (opt of chartOptions; track opt.value) {
              <mat-chip-option [value]="opt.value">{{ opt.label }}</mat-chip-option>
            }
          </mat-chip-listbox>
          <p class="desc">
            Bar charts with direct labels are more accessible than pie charts, which require
            angle estimation — a known dyscalculia difficulty.
          </p>
        </div>

        <!-- Progress Indicators -->
        <div class="section">
          <span class="section-label">Progress Indicators</span>
          <mat-chip-listbox
            aria-label="Progress indicator style"
            [value]="dyscalculia.settings().progressStyle"
            (change)="onChipChange('progressStyle', $event, 'Progress Indicators')">
            @for (opt of progressOptions; track opt.value) {
              <mat-chip-option [value]="opt.value">{{ opt.label }}</mat-chip-option>
            }
          </mat-chip-listbox>
          <p class="desc">
            Step counters and checklists replace percentage-based progress with concrete milestones.
          </p>
        </div>

        <!-- Calm Number Transitions -->
        <div class="section">
          <div class="toggle-row">
            <div class="toggle-info">
              <span class="toggle-title">Calm Number Transitions</span>
              <p class="desc">Stops animated number counters and ticker effects that can cause cognitive overload</p>
            </div>
            <mat-slide-toggle
              [checked]="dyscalculia.settings().reduceAnimations"
              (change)="onToggle('reduceAnimations', $event.checked, 'Calm Number Transitions')"
              aria-label="Calm Number Transitions" />
          </div>
        </div>

        <!-- Voice number entry (F-008) -->
        <div class="section">
          <div class="toggle-row">
            <div class="toggle-info">
              <span class="toggle-title">Voice number entry</span>
              <p class="desc">
                Adds a microphone button next to currency and rate inputs.
                Uses your browser's built-in speech recognition (Chrome / Edge).
              </p>
            </div>
            <mat-slide-toggle
              [checked]="dyscalculia.settings().voiceEntry"
              (change)="onToggle('voiceEntry', $event.checked, 'Voice number entry')"
              aria-label="Voice number entry" />
          </div>
        </div>

        <!-- Monte Carlo reveal pace (F-006) -->
        <div class="section">
          <span class="section-label">Monte Carlo Reveal Pace</span>
          <mat-chip-listbox
            aria-label="Monte Carlo reveal pace"
            [value]="dyscalculia.settings().mcMode"
            (change)="onChipChange('mcMode', $event, 'Monte Carlo Reveal Pace')">
            <mat-chip-option value="full">Full (all at once)</mat-chip-option>
            <mat-chip-option value="calm">Calm (step through)</mat-chip-option>
          </mat-chip-listbox>
          <p class="desc">
            Calm mode shows one Monte Carlo card at a time behind a "Show next" button,
            so results don't arrive as a single wall of charts.
          </p>
        </div>

        <!-- Info footer -->
        <div class="info-footer">
          <div class="info-title">About these settings</div>
          <p class="info-text">
            Dyscalculia is a neurodevelopmental cognitive disorder affecting how the brain
            processes numerical information. These settings provide permanent bypass
            strategies — not training scaffolds — because the underlying processing
            differences are persistent. Based on W3C COGA guidelines and GOV.UK
            dyscalculia design research.
          </p>
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .scroll-area {
      max-height: 60vh;
      overflow-y: auto;
      padding-right: 4px;
    }

    .master-toggle {
      margin-bottom: 16px;
      padding: 12px;
      border-radius: 8px;
      border: 1px solid var(--dark-border);
      background: var(--dark-bg-secondary);
      display: flex;
      justify-content: space-between;
      align-items: center;
      &.enabled {
        // Translucent green overlay flips cleanly across dark + cream + light
        // themes — avoids the previous hardcoded #1a2a1a (dark-on-dark, made
        // text unreadable in light mode).
        background: color-mix(in srgb, var(--dark-green) 14%, transparent);
        border-color: var(--dark-green);
      }
    }

    .toggle-info {
      flex: 1;
      margin-right: 12px;
    }
    .toggle-title {
      font-size: calc(12px * var(--font-scale, 1));
      color: var(--dark-text);
    }
    .toggle-desc {
      font-size: calc(10px * var(--font-scale, 1));
      color: var(--dark-text-muted);
      margin-top: 4px;
      line-height: 1.4;
    }

    .section {
      margin-bottom: 16px;
      padding: 12px;
      background: var(--dark-bg-secondary);
      border-radius: 8px;
      border: 1px solid var(--dark-border);
    }
    .section-label {
      font-size: calc(11px * var(--font-scale, 1));
      color: var(--dark-text-sec);
      font-weight: 600;
      margin-bottom: 8px;
      display: block;
    }
    .desc {
      font-size: calc(10px * var(--font-scale, 1));
      color: var(--dark-text-muted);
      margin-top: 4px;
      line-height: 1.4;
    }

    .toggle-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 0;
    }

    /* Material chip overrides */
    mat-chip-listbox {
      margin-top: 6px;
    }
    :host ::ng-deep {
      .mat-mdc-chip-listbox {
        gap: 4px;
      }
      .mat-mdc-chip-option {
        --mat-chip-elevated-container-color: var(--dark-bg-card);
        --mat-chip-label-text-color: var(--dark-text-sec);
        --mat-chip-elevated-selected-container-color: var(--dark-blue);
        --mat-chip-selected-label-text-color: #fff;
        --mat-chip-container-height: 32px;
        --mat-chip-label-text-size: 11px;
        font-family: var(--font-sans);
      }
    }

    .info-footer {
      padding: 12px;
      background: rgba(92, 156, 230, 0.08);
      border-radius: 8px;
      border: 1px solid rgba(92, 156, 230, 0.2);
    }
    .info-title {
      font-size: calc(11px * var(--font-scale, 1));
      color: var(--dark-blue);
      font-weight: 600;
      margin-bottom: 4px;
    }
    .info-text {
      font-size: calc(10px * var(--font-scale, 1));
      color: var(--dark-text-sec);
      line-height: 1.5;
    }
  `],
})
export class DyscalculiaSettingsComponent {
  readonly dyscalculia = inject(DyscalculiaService);
  private readonly announcer = inject(LiveAnnouncer);

  readonly numberFormatOptions: { value: NumberFormat; label: string }[] = [
    { value: 'standard', label: '$2,470' },
    { value: 'spaced', label: '$2 470' },
    { value: 'words', label: 'Two thousand...' },
  ];

  readonly spacingOptions: { value: NumberSpacing; label: string }[] = [
    { value: 'normal', label: 'Normal' },
    { value: 'wide', label: 'W i d e' },
    { value: 'grouped', label: '2  470' },
  ];

  readonly percentageOptions: { value: PercentageDisplay; label: string }[] = [
    { value: 'standard', label: '25%' },
    { value: 'natural', label: '1 in 4' },
    { value: 'proportion', label: 'A quarter' },
    { value: 'none', label: 'Words only' },
  ];

  readonly chartOptions: { value: ChartStyle; label: string }[] = [
    { value: 'bar', label: 'Bar charts' },
    { value: 'bar-labeled', label: 'Labeled bars' },
    { value: 'concrete', label: 'Concrete tiles' },
  ];

  readonly progressOptions: { value: ProgressStyle; label: string }[] = [
    { value: 'bar', label: 'Progress bar' },
    { value: 'steps', label: 'Step counter' },
    { value: 'checklist', label: 'Checklist' },
  ];

  onMasterToggle(checked: boolean): void {
    this.dyscalculia.toggle();
    this.announcer.announce(
      `Dyscalculia support ${checked ? 'enabled' : 'disabled'}`,
      'assertive'
    );
  }

  onToggle(key: string, checked: boolean, label: string): void {
    this.dyscalculia.update({ [key]: checked });
    this.announcer.announce(
      `${label} ${checked ? 'enabled' : 'disabled'}`,
      'polite'
    );
  }

  /**
   * Material's `mat-chip-listbox` interprets a click on the already-selected
   * chip as a deselect — it emits `(change)` with `value: undefined` and
   * removes the chip from its internal selection model. For these settings
   * the chips are radio-button-style (always exactly one option active), so:
   *
   *  1. We don't update settings on the deselect — the user re-clicked the
   *     option they already had. No semantic change.
   *  2. We DO need to restore the listbox's visual selection. Without this,
   *     the chip visually appears unselected even though the model still
   *     says it is — Angular's `[value]` binding doesn't push back when the
   *     bound value didn't change. We force the re-push by writing the
   *     current model value to `event.source.value`.
   *
   * `[required]="true"` on the listbox doesn't fix this — it only affects
   * form validation, not the listbox's selection behavior.
   */
  onChipChange(key: string, event: MatChipListboxChange, label: string): void {
    const value = event.value;
    if (value) {
      this.dyscalculia.update({ [key]: value });
      this.announcer.announce(`${label} changed to ${value}`, 'polite');
    } else {
      const settings = this.dyscalculia.settings() as unknown as Record<string, unknown>;
      event.source.value = settings[key];
    }
  }
}
