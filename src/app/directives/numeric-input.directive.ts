import {
  Directive,
  ElementRef,
  HostListener,
  Input,
  inject,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { DyscalculiaService } from '@services/dyscalculia.service';

type NumericKind = 'currency' | 'percent' | 'age' | 'year' | 'rate' | 'fx';

// Minimal Web Speech API typing — the DOM lib still ships these as `any` on most targets.
type SpeechRecogCtor = new () => {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: Array<Array<{ transcript: string }>> }) => void) | null;
  onerror: ((e: unknown) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};

const STEP_BY_KIND: Record<NumericKind, number> = {
  currency: 100,
  percent: 0.1,
  age: 1,
  year: 1,
  rate: 0.1,
  fx: 0.0001,
};

const MIN_BY_KIND: Partial<Record<NumericKind, number>> = {
  percent: 0,
  rate: 0,
  age: 0,
  year: 1900,
  currency: 0,
};

const MAX_BY_KIND: Partial<Record<NumericKind, number>> = {
  percent: 100,
  rate: 100,
  age: 120,
};

/**
 * Standardizes `step`, `min`, `max`, and `inputmode` attributes on numeric
 * `<input>` elements by semantic kind. Addresses Dashboard Dyscalculia F-009
 * (step consistency) and F-008 (voice-entry-friendly mobile keyboards).
 *
 * Usage: `<input type="number" appNumeric="currency">`
 */
@Directive({
  selector: 'input[appNumeric]',
  standalone: true,
})
export class NumericInputDirective implements OnInit, OnDestroy {
  @Input('appNumeric') kind: NumericKind = 'currency';

  private readonly el = inject<ElementRef<HTMLInputElement>>(ElementRef);
  private readonly dyscalculia = inject(DyscalculiaService);
  private micBtn: HTMLButtonElement | null = null;
  private recognition: InstanceType<SpeechRecogCtor> | null = null;

  ngOnInit(): void {
    const input = this.el.nativeElement;
    const step = STEP_BY_KIND[this.kind];
    const min = MIN_BY_KIND[this.kind];
    const max = MAX_BY_KIND[this.kind];

    if (input.type !== 'number') input.type = 'number';
    if (!input.getAttribute('step')) input.setAttribute('step', String(step));
    if (min !== undefined && !input.getAttribute('min')) {
      input.setAttribute('min', String(min));
    }
    if (max !== undefined && !input.getAttribute('max')) {
      input.setAttribute('max', String(max));
    }
    // `decimal` gives mobile users a numeric keypad including the separator —
    // helpful for dyscalculic users who rely on voice-to-text plus keypad.
    if (!input.getAttribute('inputmode')) {
      input.setAttribute('inputmode', this.kind === 'age' || this.kind === 'year' ? 'numeric' : 'decimal');
    }

    // Dashboard Dyscalculia F-008 — optional voice-entry affordance.
    // Attaches a microphone button on currency/rate inputs when the user
    // has opted in via dyscalculia settings and the browser supports
    // SpeechRecognition. No-op otherwise.
    if (this.shouldAttachMic()) {
      this.attachMicButton();
    }
  }

  ngOnDestroy(): void {
    this.micBtn?.remove();
    this.recognition?.stop();
  }

  private shouldAttachMic(): boolean {
    if (!this.dyscalculia.isEnabled()) return false;
    if (!this.dyscalculia.settings().voiceEntry) return false;
    // Voice entry only makes sense for free-form numeric kinds where users
    // typically want to "say a number" — skip age/year/fx which have rigid shapes.
    if (this.kind !== 'currency' && this.kind !== 'rate' && this.kind !== 'percent') return false;
    const w = window as unknown as { SpeechRecognition?: SpeechRecogCtor; webkitSpeechRecognition?: SpeechRecogCtor };
    return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
  }

  private attachMicButton(): void {
    const input = this.el.nativeElement;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Dictate number');
    btn.title = 'Dictate a number';
    btn.textContent = '🎤';
    btn.className = 'dx-mic-btn';
    // Minimal inline style so the button works without requiring a global
    // stylesheet to match every input's skinning.
    btn.style.cssText = [
      'margin-left: 4px',
      'padding: 0 6px',
      'height: 24px',
      'min-width: 28px',
      'font-size: calc(13px * var(--font-scale, 1))',
      'border: 1px solid var(--dark-border)',
      'background: var(--dark-bg-secondary)',
      'color: var(--dark-text)',
      'border-radius: 4px',
      'cursor: pointer',
      'vertical-align: middle',
    ].join(';');
    btn.addEventListener('click', () => this.startDictation());
    input.parentElement?.insertBefore(btn, input.nextSibling);
    this.micBtn = btn;
  }

  private startDictation(): void {
    const w = window as unknown as { SpeechRecognition?: SpeechRecogCtor; webkitSpeechRecognition?: SpeechRecogCtor };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    if (this.recognition) { this.recognition.stop(); return; }
    const rec = new Ctor();
    rec.lang = document.documentElement.lang || 'en-US';
    rec.interimResults = false;
    rec.continuous = false;
    if (this.micBtn) this.micBtn.textContent = '…';
    rec.onresult = (e) => {
      const transcript = e.results?.[0]?.[0]?.transcript ?? '';
      const numeric = this.transcriptToNumber(transcript);
      if (numeric != null) {
        const input = this.el.nativeElement;
        input.value = String(numeric);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    };
    rec.onend = () => {
      this.recognition = null;
      if (this.micBtn) this.micBtn.textContent = '🎤';
    };
    rec.onerror = () => {
      this.recognition = null;
      if (this.micBtn) this.micBtn.textContent = '🎤';
    };
    this.recognition = rec;
    rec.start();
  }

  /** Extract the first reasonable number from a spoken transcript
   *  ("three thousand", "3,500", "four point two"). Returns null on failure. */
  private transcriptToNumber(text: string): number | null {
    if (!text) return null;
    // Try a direct numeric match first (covers "3500", "3,500", "4.2").
    const direct = text.replace(/[,\s]/g, '').match(/-?\d+(\.\d+)?/);
    if (direct) {
      const n = Number(direct[0]);
      if (Number.isFinite(n)) return n;
    }
    // Fallback: naive word-to-number for small cases ("three thousand").
    const words: Record<string, number> = {
      zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
      seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
      thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
      eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40,
      fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
      hundred: 100, thousand: 1000, million: 1_000_000,
    };
    let total = 0;
    let current = 0;
    for (const raw of text.toLowerCase().split(/[\s-]+/)) {
      const w = words[raw];
      if (w === undefined) continue;
      if (w === 100) current = (current || 1) * 100;
      else if (w >= 1000) { total += (current || 1) * w; current = 0; }
      else current += w;
    }
    const n = total + current;
    return n > 0 ? n : null;
  }

  /** Strip thousands-separator characters typed or pasted. */
  @HostListener('paste', ['$event'])
  onPaste(event: ClipboardEvent): void {
    const text = event.clipboardData?.getData('text') ?? '';
    if (/[,\s]/.test(text)) {
      event.preventDefault();
      const cleaned = text.replace(/[,\s]/g, '');
      const input = this.el.nativeElement;
      input.value = cleaned;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
}
