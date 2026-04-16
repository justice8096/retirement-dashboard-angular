import { Injectable, signal, computed, effect } from '@angular/core';
import {
  DyslexiaSettings,
  DYSLEXIA_DEFAULTS,
  DYSLEXIA_LINE_HEIGHTS,
  DYSLEXIA_LETTER_SPACING,
  DYSLEXIA_WORD_SPACING,
  DYSLEXIA_FONT_FAMILIES,
  DYSLEXIA_READ_ALOUD_RATES,
} from '@models/dyslexia.model';

const STORAGE_KEY = 'dyslexia-settings';

/**
 * Dyslexia accommodation service — mirrors DyscalculiaService.
 *
 * Manages user preferences for font, spacing, contrast, reading aids, and
 * read-aloud (Web Speech API). Settings are persisted to localStorage and
 * applied to the document root as CSS variables so any component can opt in
 * via `var(--app-font-family)` / `var(--prose-line-height)` etc.
 */
@Injectable({ providedIn: 'root' })
export class DyslexiaService {
  readonly settings = signal<DyslexiaSettings>(DYSLEXIA_DEFAULTS);

  readonly isEnabled = computed(() => this.settings().enabled);
  readonly fontFamily = computed(() =>
    DYSLEXIA_FONT_FAMILIES[this.settings().fontFamily],
  );
  readonly lineHeight = computed(() =>
    DYSLEXIA_LINE_HEIGHTS[this.settings().lineHeight],
  );
  readonly letterSpacing = computed(() =>
    DYSLEXIA_LETTER_SPACING[this.settings().letterSpacing],
  );
  readonly wordSpacing = computed(() =>
    DYSLEXIA_WORD_SPACING[this.settings().wordSpacing],
  );
  readonly readAloudRate = computed(() =>
    DYSLEXIA_READ_ALOUD_RATES[this.settings().readAloudRate],
  );

  private readonly speechSupported =
    typeof window !== 'undefined' && 'speechSynthesis' in window;
  private activeUtterance: SpeechSynthesisUtterance | null = null;

  constructor() {
    effect(() => this.applyToDocument(this.settings()));
  }

  toggle(): void {
    this.update({ enabled: !this.settings().enabled });
  }

  update(partial: Partial<DyslexiaSettings>): void {
    this.settings.update((current) => ({ ...current, ...partial }));
    this.persist();
  }

  reset(): void {
    this.settings.set(DYSLEXIA_DEFAULTS);
    this.persist();
  }

  loadSaved(): void {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<DyslexiaSettings>;
        this.settings.update((current) => ({ ...current, ...parsed }));
      }
    } catch {
      /* defaults remain */
    }
  }

  // ─── Read-aloud (Web Speech API) ─────────────────────────────────

  get canReadAloud(): boolean {
    return this.speechSupported && this.settings().readAloudEnabled;
  }

  readAloud(text: string): void {
    if (!this.speechSupported) return;
    this.stopReading();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = this.readAloudRate();
    utter.pitch = 1.0;
    utter.lang = document.documentElement.lang || 'en';
    this.activeUtterance = utter;
    window.speechSynthesis.speak(utter);
  }

  stopReading(): void {
    if (this.speechSupported) {
      window.speechSynthesis.cancel();
    }
    this.activeUtterance = null;
  }

  isReading(): boolean {
    return this.speechSupported && window.speechSynthesis.speaking;
  }

  // ─── Bionic-style reading aid helper ─────────────────────────────

  /**
   * Split a string into `{bold, rest}` pairs approximating the Bionic Reading
   * pattern — the first ~40–60% of each word is bolded as a fixation anchor.
   * Components render: `<strong>{bold}</strong>{rest}` for each pair.
   */
  bionicSegments(text: string): { bold: string; rest: string }[] {
    return text.split(/(\s+)/).map((chunk) => {
      if (!chunk.trim()) return { bold: '', rest: chunk };
      const cut = Math.max(1, Math.ceil(chunk.length * 0.45));
      return { bold: chunk.slice(0, cut), rest: chunk.slice(cut) };
    });
  }

  // ─── Internals ──────────────────────────────────────────────────

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings()));
    } catch {
      /* ignore */
    }
  }

  /** Sync settings to CSS custom properties on :root and toggle body classes. */
  private applyToDocument(s: DyslexiaSettings): void {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;

    if (s.enabled) {
      root.style.setProperty('--app-font-family', DYSLEXIA_FONT_FAMILIES[s.fontFamily]);
      root.style.setProperty('--prose-line-height', String(DYSLEXIA_LINE_HEIGHTS[s.lineHeight]));
      root.style.setProperty('--prose-letter-spacing', DYSLEXIA_LETTER_SPACING[s.letterSpacing]);
      root.style.setProperty('--prose-word-spacing', DYSLEXIA_WORD_SPACING[s.wordSpacing]);
    } else {
      root.style.removeProperty('--app-font-family');
      root.style.removeProperty('--prose-line-height');
      root.style.removeProperty('--prose-letter-spacing');
      root.style.removeProperty('--prose-word-spacing');
    }

    // Contrast mode — single class that styles.scss consumes
    const contrastClasses = [
      'dx-contrast-dark',
      'dx-contrast-softer-dark',
      'dx-contrast-cream',
      'dx-contrast-light',
    ];
    contrastClasses.forEach((c) => root.classList.remove(c));
    if (s.enabled && s.contrastMode !== 'dark') {
      root.classList.add(`dx-contrast-${s.contrastMode}`);
    }

    // Reading aid class
    const aidClasses = ['dx-aid-bionic', 'dx-aid-ruler'];
    aidClasses.forEach((c) => root.classList.remove(c));
    if (s.enabled && s.readingAid !== 'none') {
      root.classList.add(`dx-aid-${s.readingAid}`);
    }

    // Master enabled flag (scopes other utility rules)
    root.classList.toggle('dx-enabled', s.enabled);
  }
}
