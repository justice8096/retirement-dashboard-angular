import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatChipsModule } from '@angular/material/chips';
import { LiveAnnouncer } from '@angular/cdk/a11y';
import { DyslexiaService } from '@services/dyslexia.service';
import {
  DyslexiaFontFamily,
  DyslexiaLineHeight,
  DyslexiaLetterSpacing,
  DyslexiaContrastMode,
  DyslexiaReadingAid,
  DyslexiaReadAloudRate,
} from '@models/dyslexia.model';

@Component({
  selector: 'app-dyslexia-settings',
  standalone: true,
  imports: [MatSlideToggleModule, MatChipsModule],
  template: `
    <div class="scroll-area">

      <!-- Master toggle -->
      <div class="master-toggle" [class.enabled]="dyslexia.isEnabled()">
        <div class="toggle-info">
          <span class="toggle-title">Dyslexia Support</span>
          <p class="toggle-desc">
            Adapts fonts, spacing, contrast, and reading aids across the dashboard for dyslexic readers.
          </p>
        </div>
        <mat-slide-toggle
          [checked]="dyslexia.isEnabled()"
          (change)="onMasterToggle($event.checked)"
          aria-label="Dyslexia Support" />
      </div>

      @if (dyslexia.isEnabled()) {
        <!-- Font Family -->
        <div class="section">
          <span class="section-label">Font</span>
          <mat-chip-listbox
            aria-label="Font family"
            [value]="dyslexia.settings().fontFamily"
            (change)="onChipChange('fontFamily', $event.value, 'Font')">
            @for (opt of fontOptions; track opt.value) {
              <mat-chip-option [value]="opt.value">{{ opt.label }}</mat-chip-option>
            }
          </mat-chip-listbox>
          <p class="desc">
            Atkinson Hyperlegible uses shapes that reduce letter confusion. OpenDyslexic adds heavier baselines.
            Defaults to Inter.
          </p>
        </div>

        <!-- Line Height -->
        <div class="section">
          <span class="section-label">Line Spacing</span>
          <mat-chip-listbox
            aria-label="Line spacing"
            [value]="dyslexia.settings().lineHeight"
            (change)="onChipChange('lineHeight', $event.value, 'Line Spacing')">
            @for (opt of lineHeightOptions; track opt.value) {
              <mat-chip-option [value]="opt.value">{{ opt.label }}</mat-chip-option>
            }
          </mat-chip-listbox>
          <p class="desc">
            Wider line spacing reduces visual tracking errors. BDA recommends at least 1.5&times;.
          </p>
        </div>

        <!-- Letter Spacing -->
        <div class="section">
          <span class="section-label">Letter Spacing</span>
          <mat-chip-listbox
            aria-label="Letter spacing"
            [value]="dyslexia.settings().letterSpacing"
            (change)="onChipChange('letterSpacing', $event.value, 'Letter Spacing')">
            @for (opt of spacingOptions; track opt.value) {
              <mat-chip-option [value]="opt.value">{{ opt.label }}</mat-chip-option>
            }
          </mat-chip-listbox>
        </div>

        <!-- Word Spacing -->
        <div class="section">
          <span class="section-label">Word Spacing</span>
          <mat-chip-listbox
            aria-label="Word spacing"
            [value]="dyslexia.settings().wordSpacing"
            (change)="onChipChange('wordSpacing', $event.value, 'Word Spacing')">
            @for (opt of spacingOptions; track opt.value) {
              <mat-chip-option [value]="opt.value">{{ opt.label }}</mat-chip-option>
            }
          </mat-chip-listbox>
        </div>

        <!-- Contrast Mode -->
        <div class="section">
          <span class="section-label">Background &amp; Contrast</span>
          <mat-chip-listbox
            aria-label="Contrast mode"
            [value]="dyslexia.settings().contrastMode"
            (change)="onChipChange('contrastMode', $event.value, 'Background &amp; Contrast')">
            @for (opt of contrastOptions; track opt.value) {
              <mat-chip-option [value]="opt.value">{{ opt.label }}</mat-chip-option>
            }
          </mat-chip-listbox>
          <p class="desc">
            BDA guidance recommends avoiding pure white-on-black. Cream or softer-dark can reduce visual stress.
          </p>
        </div>

        <!-- Reading Aid -->
        <div class="section">
          <span class="section-label">Reading Aid</span>
          <mat-chip-listbox
            aria-label="Reading aid overlay"
            [value]="dyslexia.settings().readingAid"
            (change)="onChipChange('readingAid', $event.value, 'Reading Aid')">
            @for (opt of aidOptions; track opt.value) {
              <mat-chip-option [value]="opt.value">{{ opt.label }}</mat-chip-option>
            }
          </mat-chip-listbox>
          <p class="desc">
            Bionic bolds the first part of each word to anchor fixation. Ruler adds a horizontal focus line that follows the cursor.
          </p>
        </div>

        <!-- Read Aloud -->
        <div class="section">
          <div class="toggle-row">
            <div class="toggle-info">
              <span class="toggle-title">Read-aloud Button</span>
              <p class="desc">Shows a "Read this screen" button that uses your browser's text-to-speech.</p>
            </div>
            <mat-slide-toggle
              [checked]="dyslexia.settings().readAloudEnabled"
              (change)="onToggle('readAloudEnabled', $event.checked, 'Read-aloud')"
              aria-label="Read-aloud Button" />
          </div>
          @if (dyslexia.settings().readAloudEnabled) {
            <mat-chip-listbox
              aria-label="Read-aloud speed"
              [value]="dyslexia.settings().readAloudRate"
              (change)="onChipChange('readAloudRate', $event.value, 'Read-aloud Speed')">
              @for (opt of rateOptions; track opt.value) {
                <mat-chip-option [value]="opt.value">{{ opt.label }}</mat-chip-option>
              }
            </mat-chip-listbox>
          }
        </div>

        <!-- Reading Progress -->
        <div class="section">
          <div class="toggle-row">
            <div class="toggle-info">
              <span class="toggle-title">Reading Progress Bar</span>
              <p class="desc">Shows a thin bar at the top of long screens indicating how far you've scrolled.</p>
            </div>
            <mat-slide-toggle
              [checked]="dyslexia.settings().showReadingProgress"
              (change)="onToggle('showReadingProgress', $event.checked, 'Reading Progress')"
              aria-label="Reading Progress Bar" />
          </div>
        </div>

        <!-- Keyboard Shortcut Hints -->
        <div class="section">
          <div class="toggle-row">
            <div class="toggle-info">
              <span class="toggle-title">Keyboard Shortcut Hints</span>
              <p class="desc">Shows a discoverable cheatsheet (press <kbd>?</kbd>) listing shortcuts.</p>
            </div>
            <mat-slide-toggle
              [checked]="dyslexia.settings().showShortcutHints"
              (change)="onToggle('showShortcutHints', $event.checked, 'Keyboard Shortcut Hints')"
              aria-label="Keyboard Shortcut Hints" />
          </div>
        </div>

        <!-- Info footer -->
        <div class="info-footer">
          <div class="info-title">About these settings</div>
          <p class="info-text">
            Dyslexia is a neurodevelopmental cognitive disorder affecting phonological and orthographic
            processing. These settings are designed as permanent accommodations, not training scaffolds.
            Grounded in IDA Knowledge &amp; Practice Standards, BDA dyslexia typography guidance, and
            the Dyslexia UX Heuristics.
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
      font-size: 14px;
      color: var(--dark-text);
    }
    .toggle-desc {
      font-size: 12px;
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
      font-size: 14px;
      color: var(--dark-text-sec);
      font-weight: 600;
      margin-bottom: 8px;
      display: block;
    }
    .desc {
      font-size: 12px;
      color: var(--dark-text-muted);
      margin-top: 4px;
      line-height: 1.5;
    }

    .toggle-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 0;
    }

    kbd {
      display: inline-block;
      padding: 1px 5px;
      font-family: var(--font-sans);
      font-size: 11px;
      font-weight: 600;
      color: var(--dark-text);
      background: var(--dark-bg-card);
      border: 1px solid var(--dark-border);
      border-radius: 3px;
    }

    /* Material chip overrides — 14px floor per dyslexia audit F-002 */
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
        --mat-chip-container-height: 34px;
        --mat-chip-label-text-size: 14px;
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
      font-size: 13px;
      color: var(--dark-blue);
      font-weight: 600;
      margin-bottom: 4px;
    }
    .info-text {
      font-size: 12px;
      color: var(--dark-text-sec);
      line-height: 1.5;
    }
  `],
})
export class DyslexiaSettingsComponent {
  readonly dyslexia = inject(DyslexiaService);
  private readonly announcer = inject(LiveAnnouncer);

  readonly fontOptions: { value: DyslexiaFontFamily; label: string }[] = [
    { value: 'default', label: 'Inter (default)' },
    { value: 'atkinson', label: 'Atkinson Hyperlegible' },
    { value: 'open-dyslexic', label: 'OpenDyslexic' },
    { value: 'lexie', label: 'Lexie Readable' },
  ];

  readonly lineHeightOptions: { value: DyslexiaLineHeight; label: string }[] = [
    { value: 'normal', label: 'Normal (1.4)' },
    { value: 'relaxed', label: 'Relaxed (1.6)' },
    { value: 'loose', label: 'Loose (1.8)' },
  ];

  readonly spacingOptions: { value: DyslexiaLetterSpacing; label: string }[] = [
    { value: 'normal', label: 'Normal' },
    { value: 'wide', label: 'Wide' },
  ];

  readonly contrastOptions: { value: DyslexiaContrastMode; label: string }[] = [
    { value: 'dark', label: 'Dark (default)' },
    { value: 'softer-dark', label: 'Softer dark' },
    { value: 'cream', label: 'Cream' },
    { value: 'light', label: 'Light' },
  ];

  readonly aidOptions: { value: DyslexiaReadingAid; label: string }[] = [
    { value: 'none', label: 'None' },
    { value: 'bionic', label: 'Bionic bolding' },
    { value: 'ruler', label: 'Reading ruler' },
  ];

  readonly rateOptions: { value: DyslexiaReadAloudRate; label: string }[] = [
    { value: 'slow', label: 'Slow' },
    { value: 'normal', label: 'Normal' },
    { value: 'fast', label: 'Fast' },
  ];

  onMasterToggle(checked: boolean): void {
    this.dyslexia.toggle();
    this.announcer.announce(
      `Dyslexia support ${checked ? 'enabled' : 'disabled'}`,
      'assertive',
    );
  }

  onToggle(key: string, checked: boolean, label: string): void {
    this.dyslexia.update({ [key]: checked });
    this.announcer.announce(
      `${label} ${checked ? 'enabled' : 'disabled'}`,
      'polite',
    );
  }

  onChipChange(key: string, value: string, label: string): void {
    if (value) {
      this.dyslexia.update({ [key]: value });
      this.announcer.announce(`${label} changed to ${value}`, 'polite');
    }
  }
}
