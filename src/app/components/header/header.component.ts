import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { NavigationService } from '@services/navigation.service';
import { DyscalculiaService } from '@services/dyscalculia.service';
import { AuthService } from '@services/auth.service';

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

        @if (auth.isSignedIn()) {
          <span class="who" [matTooltip]="'Signed in as ' + (auth.displayName() || 'user')">
            {{ auth.displayName() }}
          </span>
          <button mat-stroked-button
            (click)="signOut()"
            aria-label="Sign out"
            matTooltip="Sign out"
            class="ctrl-btn">
            Sign out
          </button>
        }
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
      --mat-button-outlined-container-height: 32px;
      --mat-button-outlined-label-text-size: 11px;
      --mat-button-outlined-outline-color: var(--dark-border);
      --mat-button-outlined-label-text-color: var(--dark-text-sec);
      font-family: var(--font-sans);
    }
    .icon-btn {
      --mat-fab-small-container-color: var(--dark-bg-card);
      --mat-fab-small-container-shape: 6px;
      width: 36px;
      height: 36px;
      font-size: 14px;
      &.active-green {
        --mat-fab-small-container-color: var(--dark-green);
        color: #fff;
      }
      &.active-blue {
        --mat-fab-small-container-color: var(--dark-blue);
        color: #fff;
      }
    }
    .who {
      font-size: 12px;
      color: var(--dark-text-sec);
      max-width: 180px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `],
})
export class HeaderComponent {
  readonly nav = inject(NavigationService);
  readonly dyscalculia = inject(DyscalculiaService);
  readonly auth = inject(AuthService);

  signOut(): void {
    this.auth.signOut().catch((err: unknown) => {
      console.error('Sign out failed', err);
    });
  }
}
