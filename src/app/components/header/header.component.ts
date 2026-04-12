import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { NavigationService } from '@services/navigation.service';
import { DyscalculiaService } from '@services/dyscalculia.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [MatButtonModule, MatTooltipModule],
  template: `
    <header class="header">
      <div class="branding">
        <h1 class="title">Retirement Planning Dashboard</h1>
        <div class="subtitle">Cost comparison &amp; retirement analysis</div>
      </div>

      <div class="controls">
        <button mat-stroked-button
          (click)="nav.toggleNavMode()"
          [attr.aria-label]="'Switch to ' + (nav.navMode() === 'compact' ? 'labeled' : 'compact') + ' navigation'"
          class="ctrl-btn">
          {{ nav.navMode() === 'compact' ? '☰ Labels' : '◻ Compact' }}
        </button>

        <button mat-mini-fab
          (click)="dyscalculia.toggle()"
          [matTooltip]="dyscalculia.isEnabled() ? 'Dyscalculia support ON' : 'Dyscalculia support OFF'"
          [attr.aria-label]="dyscalculia.isEnabled() ? 'Disable dyscalculia support' : 'Enable dyscalculia support'"
          class="icon-btn"
          [class.active-green]="dyscalculia.isEnabled()">
          🧠
        </button>

        <button mat-mini-fab
          (click)="nav.toggleA11yPanel()"
          aria-label="Accessibility settings"
          matTooltip="Accessibility settings"
          class="icon-btn"
          [class.active-blue]="nav.showA11yPanel()">
          ♿
        </button>

        <div class="avatar">JC</div>
      </div>
    </header>
  `,
  styles: [`
    .header {
      background: var(--dark-bg-secondary);
      border-bottom: 2px solid var(--dark-amber);
      padding: 12px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-shrink: 0;
      z-index: 50;
    }
    .title {
      font-size: 18px;
      color: var(--dark-amber);
      font-weight: 700;
      margin: 0;
    }
    .subtitle {
      font-size: 11px;
      color: var(--dark-text-sec);
    }
    .controls {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .ctrl-btn {
      --mdc-outlined-button-container-height: 32px;
      --mdc-outlined-button-label-text-size: 11px;
      --mdc-outlined-button-outline-color: var(--dark-border);
      --mdc-outlined-button-label-text-color: var(--dark-text-sec);
      font-family: var(--font-sans);
    }
    .icon-btn {
      --mdc-fab-small-container-color: var(--dark-bg-card);
      --mdc-fab-small-container-shape: 6px;
      width: 36px;
      height: 36px;
      font-size: 14px;
      &.active-green {
        --mdc-fab-small-container-color: var(--dark-green);
        color: #fff;
      }
      &.active-blue {
        --mdc-fab-small-container-color: var(--dark-blue);
        color: #fff;
      }
    }
    .avatar {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: var(--dark-purple);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      font-weight: 700;
      color: #fff;
    }
  `],
})
export class HeaderComponent {
  readonly nav = inject(NavigationService);
  readonly dyscalculia = inject(DyscalculiaService);
}
