import {
  Directive,
  ElementRef,
  HostListener,
  Input,
  inject,
  OnInit,
} from '@angular/core';

type NumericKind = 'currency' | 'percent' | 'age' | 'year' | 'rate' | 'fx';

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
export class NumericInputDirective implements OnInit {
  @Input('appNumeric') kind: NumericKind = 'currency';

  private readonly el = inject<ElementRef<HTMLInputElement>>(ElementRef);

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
