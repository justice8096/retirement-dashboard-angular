import { Component, inject } from '@angular/core';
import { MatTabsModule } from '@angular/material/tabs';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatChipsModule } from '@angular/material/chips';
import { NavigationService } from '@services/navigation.service';
import { DyscalculiaService } from '@services/dyscalculia.service';
import { DyslexiaService } from '@services/dyslexia.service';
import { DyscalculiaSettingsComponent } from '@components/dyscalculia-settings/dyscalculia-settings.component';
import { DyslexiaSettingsComponent } from '@components/dyslexia-settings/dyslexia-settings.component';
import { FontSize } from '@models/navigation.model';

@Component({
  selector: 'app-accessibility-panel',
  standalone: true,
  imports: [
    MatTabsModule,
    MatSlideToggleModule,
    MatChipsModule,
    DyscalculiaSettingsComponent,
    DyslexiaSettingsComponent,
  ],
  template: `
    <div class="panel">
      <mat-tab-group
        [selectedIndex]="tabIndex"
        (selectedIndexChange)="onTabChange($event)"
        animationDuration="150ms">

        <!-- Display tab -->
        <mat-tab>
          <ng-template mat-tab-label>
            <span class="tab-label">🖥️ Display</span>
          </ng-template>

          <div class="tab-content">
            <div class="display-settings">
              <span class="settings-title">Quick Settings:</span>

              <div class="setting-group">
                <span class="setting-label">Nav:</span>
                <mat-chip-listbox
                  aria-label="Navigation mode"
                  [value]="nav.navMode()"
                  (change)="nav.navMode.set($event.value)">
                  <mat-chip-option value="compact">Icons</mat-chip-option>
                  <mat-chip-option value="expanded">Labels</mat-chip-option>
                </mat-chip-listbox>
              </div>

              <div class="setting-group">
                <span class="setting-label">Text:</span>
                <mat-chip-listbox
                  aria-label="Font size"
                  [value]="nav.fontSize()"
                  (change)="nav.fontSize.set($event.value)">
                  @for (sz of fontSizes; track sz.key) {
                    <mat-chip-option [value]="sz.key">{{ sz.label }}</mat-chip-option>
                  }
                </mat-chip-listbox>
              </div>
            </div>
          </div>
        </mat-tab>

        <!-- Dyslexia tab -->
        <mat-tab>
          <ng-template mat-tab-label>
            <span class="tab-label">
              📖 Reading &amp; Text
              @if (dyslexia.isEnabled()) {
                <span class="status-dot" aria-label="Dyslexia support enabled"></span>
              }
            </span>
          </ng-template>

          <div class="tab-content">
            <app-dyslexia-settings />
          </div>
        </mat-tab>

        <!-- Dyscalculia tab -->
        <mat-tab>
          <ng-template mat-tab-label>
            <span class="tab-label">
              🧠 Numbers &amp; Data
              @if (dyscalculia.isEnabled()) {
                <span class="status-dot" aria-label="Dyscalculia support enabled"></span>
              }
            </span>
          </ng-template>

          <div class="tab-content">
            <app-dyscalculia-settings />
          </div>
        </mat-tab>
      </mat-tab-group>

      <div class="hint-bar">
        Keyboard: <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>A</kbd> toggle panel ·
        <kbd>?</kbd> keyboard shortcuts
      </div>
    </div>
  `,
  styles: [`
    .panel {
      background: var(--dark-bg-card);
      border-bottom: 1px solid var(--dark-border);
      flex-shrink: 0;
    }

    .tab-label {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 14px;
    }
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--dark-green);
      display: inline-block;
    }

    .tab-content {
      padding: 12px 20px;
    }
    .display-settings {
      display: flex;
      gap: 16px;
      align-items: center;
      flex-wrap: wrap;
    }
    .settings-title {
      font-size: 14px;
      color: var(--dark-text-sec);
      font-weight: 600;
    }
    .setting-group {
      display: flex;
      gap: 4px;
      align-items: center;
    }
    .setting-label {
      font-size: 14px;
      color: var(--dark-text-sec);
    }
    .hint-bar {
      padding: 4px 20px;
      font-size: 12px;
      color: var(--dark-text-muted);
      border-top: 1px solid var(--dark-border);
    }
    kbd {
      display: inline-block;
      padding: 1px 5px;
      font-size: 11px;
      font-weight: 600;
      color: var(--dark-text);
      background: var(--dark-bg-secondary);
      border: 1px solid var(--dark-border);
      border-radius: 3px;
    }

    /* Material tab + chip overrides — 14px floor per dyslexia audit F-002 */
    :host ::ng-deep {
      .mat-mdc-tab-header {
        background: transparent;
        border-bottom: 1px solid var(--dark-border);
      }
      .mat-mdc-tab {
        min-width: 120px;
      }
      .mat-mdc-chip-option {
        --mat-chip-elevated-container-color: var(--dark-bg-secondary);
        --mat-chip-label-text-color: var(--dark-text-sec);
        --mat-chip-elevated-selected-container-color: var(--dark-blue);
        --mat-chip-selected-label-text-color: #fff;
        --mat-chip-container-height: 32px;
        --mat-chip-label-text-size: 14px;
        font-family: var(--font-sans);
      }
    }
  `],
})
export class AccessibilityPanelComponent {
  readonly nav = inject(NavigationService);
  readonly dyscalculia = inject(DyscalculiaService);
  readonly dyslexia = inject(DyslexiaService);

  readonly fontSizes: { key: FontSize; label: string }[] = [
    { key: 'normal', label: 'Aa' },
    { key: 'large', label: 'Aa+' },
    { key: 'xlarge', label: 'Aa++' },
  ];

  get tabIndex(): number {
    const tab = this.nav.a11yTab();
    if (tab === 'display') return 0;
    if (tab === 'dyslexia') return 1;
    return 2;
  }

  onTabChange(index: number): void {
    const tab = index === 0 ? 'display' : index === 1 ? 'dyslexia' : 'dyscalculia';
    this.nav.setA11yTab(tab);
  }
}
