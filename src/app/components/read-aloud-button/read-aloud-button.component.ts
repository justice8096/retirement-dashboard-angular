import { Component, inject, signal, HostListener, ChangeDetectionStrategy } from '@angular/core';
import { DyslexiaService } from '@services/dyslexia.service';

/**
 * Floating "Read this screen" button — uses Web Speech API via DyslexiaService.
 * Addresses Dashboard Dyslexia F-003 (read-aloud / TTS affordance).
 */
@Component({
  selector: 'app-read-aloud-button',
  standalone: true,
  template: `
    <button
      type="button"
      class="fab"
      [class.speaking]="speaking()"
      (click)="toggle()"
      [attr.aria-label]="speaking() ? 'Stop reading' : 'Read this screen'">
      @if (speaking()) {
        <span aria-hidden="true">⏸</span>
        <span class="label">Stop</span>
      } @else {
        <span aria-hidden="true">🔊</span>
        <span class="label">Read</span>
      }
    </button>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .fab {
      position: fixed;
      right: 20px;
      bottom: 70px;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 16px;
      border-radius: 28px;
      background: var(--dark-blue);
      color: #fff;
      border: none;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
      cursor: pointer;
      font-family: var(--app-font-family, var(--font-sans));
      font-size: calc(14px * var(--font-scale, 1));
      font-weight: 600;
      z-index: 9997;
    }
    .fab:hover { filter: brightness(1.1); }
    .fab:focus-visible {
      outline: 2px solid var(--dark-amber);
      outline-offset: 2px;
    }
    .fab.speaking {
      background: var(--dark-amber);
    }
    .label { line-height: 1; }
  `],
})
export class ReadAloudButtonComponent {
  private readonly dyslexia = inject(DyslexiaService);
  readonly speaking = signal(false);
  private pollId: number | null = null;

  @HostListener('window:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    // Ctrl+Shift+R triggers read — ignore if focus is in an input
    if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'r') {
      const t = event.target;
      if (t instanceof HTMLElement) {
        const tag = t.tagName.toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select' || t.isContentEditable) {
          return;
        }
      }
      event.preventDefault();
      this.toggle();
    }
  }

  toggle(): void {
    if (this.speaking()) {
      this.dyslexia.stopReading();
      this.speaking.set(false);
      this.clearPoll();
      return;
    }
    const text = this.collectScreenText();
    if (!text) return;
    this.dyslexia.readAloud(text);
    this.speaking.set(true);
    this.pollId = window.setInterval(() => {
      if (!this.dyslexia.isReading()) {
        this.speaking.set(false);
        this.clearPoll();
      }
    }, 250);
  }

  private clearPoll(): void {
    if (this.pollId !== null) {
      window.clearInterval(this.pollId);
      this.pollId = null;
    }
  }

  private collectScreenText(): string {
    const main = document.querySelector('app-mock-content') ?? document.body;
    if (!main) return '';
    return (main.textContent ?? '').replace(/\s+/g, ' ').trim();
  }
}
