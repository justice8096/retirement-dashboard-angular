import { Component, inject, OnInit } from '@angular/core';
import { NavigationService } from '@services/navigation.service';
import { DyscalculiaService } from '@services/dyscalculia.service';
import { HeaderComponent } from '@components/header/header.component';
import { IconRailComponent } from '@components/icon-rail/icon-rail.component';
import { LabeledRailComponent } from '@components/labeled-rail/labeled-rail.component';
import { ContextBarComponent } from '@components/context-bar/context-bar.component';
import { StatusBarComponent } from '@components/status-bar/status-bar.component';
import { AccessibilityPanelComponent } from '@components/accessibility-panel/accessibility-panel.component';
import { MockContentComponent } from '@components/mock-content/mock-content.component';
import { OnboardingComponent } from '@components/onboarding/onboarding.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    HeaderComponent,
    IconRailComponent,
    LabeledRailComponent,
    ContextBarComponent,
    StatusBarComponent,
    AccessibilityPanelComponent,
    MockContentComponent,
    OnboardingComponent,
  ],
  template: `
    @if (nav.phase() === 'onboarding') {
      <app-onboarding />
    } @else {
      <div class="shell">
        <app-header />

        @if (nav.showA11yPanel()) {
          <app-accessibility-panel />
        }

        <div class="main-layout">
          @if (nav.navMode() === 'compact') {
            <app-icon-rail />
          } @else {
            <app-labeled-rail />
          }

          <div class="content-area">
            <app-context-bar />
            <app-mock-content />
          </div>
        </div>

        <app-status-bar />
      </div>
    }
  `,
  styles: [`
    .shell {
      height: 100vh;
      display: flex;
      flex-direction: column;
      font-family: var(--font-sans);
      background: var(--dark-bg);
      color: var(--dark-text);
    }
    .main-layout {
      display: flex;
      flex: 1;
      overflow: hidden;
    }
    .content-area {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      min-height: 0;
    }
    /* Angular host elements must participate in flex layout */
    app-context-bar {
      flex-shrink: 0;
    }
    app-mock-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-height: 0;
      overflow: hidden;
    }
  `],
})
export class AppComponent implements OnInit {
  readonly nav = inject(NavigationService);
  private readonly dyscalculia = inject(DyscalculiaService);

  ngOnInit(): void {
    this.dyscalculia.loadSaved();
  }
}
