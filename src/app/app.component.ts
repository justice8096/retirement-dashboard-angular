import { Component, inject, OnInit, signal, HostListener } from '@angular/core';
import { NavigationService } from '@services/navigation.service';
import { DyscalculiaService } from '@services/dyscalculia.service';
import { DyslexiaService } from '@services/dyslexia.service';
import { HeaderComponent } from '@components/header/header.component';
import { IconRailComponent } from '@components/icon-rail/icon-rail.component';
import { LabeledRailComponent } from '@components/labeled-rail/labeled-rail.component';
import { ContextBarComponent } from '@components/context-bar/context-bar.component';
import { StatusBarComponent } from '@components/status-bar/status-bar.component';
import { AccessibilityPanelComponent } from '@components/accessibility-panel/accessibility-panel.component';
import { MockContentComponent } from '@components/mock-content/mock-content.component';
import { OnboardingComponent } from '@components/onboarding/onboarding.component';
import { ShortcutCheatsheetComponent } from '@components/shortcut-cheatsheet/shortcut-cheatsheet.component';
import { ReadAloudButtonComponent } from '@components/read-aloud-button/read-aloud-button.component';

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
    ShortcutCheatsheetComponent,
    ReadAloudButtonComponent,
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

        <!-- Reading progress bar (dyslexia F-011) -->
        @if (dyslexia.isEnabled() && dyslexia.settings().showReadingProgress) {
          <div class="dx-reading-progress visible" [style.width.%]="scrollProgress()"></div>
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

        <!-- Reading ruler (dyslexia F-007) -->
        @if (dyslexia.isEnabled() && dyslexia.settings().readingAid === 'ruler') {
          <div class="dx-ruler" [style.top.px]="rulerY()"></div>
        }

        <!-- Floating read-aloud button (dyslexia F-003) -->
        @if (dyslexia.canReadAloud) {
          <app-read-aloud-button />
        }

        <!-- Shortcut cheatsheet (dyslexia F-012) -->
        @if (showShortcuts()) {
          <app-shortcut-cheatsheet (close)="showShortcuts.set(false)" />
        }
      </div>
    }
  `,
  styles: [`
    .shell {
      height: 100vh;
      display: flex;
      flex-direction: column;
      font-family: var(--app-font-family, var(--font-sans));
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
    .dx-reading-progress.visible {
      display: block;
    }
  `],
})
export class AppComponent implements OnInit {
  readonly nav = inject(NavigationService);
  readonly dyslexia = inject(DyslexiaService);
  private readonly dyscalculia = inject(DyscalculiaService);

  readonly showShortcuts = signal(false);
  readonly rulerY = signal(0);
  readonly scrollProgress = signal(0);

  ngOnInit(): void {
    this.dyscalculia.loadSaved();
    this.dyslexia.loadSaved();
  }

  @HostListener('window:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    // '?' opens shortcut cheatsheet (dyslexia F-012)
    if (event.key === '?' && !this.isInInput(event.target)) {
      event.preventDefault();
      this.showShortcuts.update((v) => !v);
    }
    // Escape closes cheatsheet
    if (event.key === 'Escape' && this.showShortcuts()) {
      this.showShortcuts.set(false);
    }
  }

  @HostListener('window:mousemove', ['$event'])
  onMouseMove(event: MouseEvent): void {
    if (this.dyslexia.isEnabled() && this.dyslexia.settings().readingAid === 'ruler') {
      this.rulerY.set(event.clientY - 16);
    }
  }

  @HostListener('window:scroll', ['$event'])
  onScroll(): void {
    if (!this.dyslexia.isEnabled() || !this.dyslexia.settings().showReadingProgress) return;
    const doc = document.documentElement;
    const max = doc.scrollHeight - doc.clientHeight;
    if (max <= 0) return;
    this.scrollProgress.set(Math.min(100, (window.scrollY / max) * 100));
  }

  private isInInput(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
  }
}
