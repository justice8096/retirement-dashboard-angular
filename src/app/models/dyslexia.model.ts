export type DyslexiaFontFamily = 'default' | 'atkinson' | 'open-dyslexic' | 'lexie';
export type DyslexiaLineHeight = 'normal' | 'relaxed' | 'loose';
export type DyslexiaLetterSpacing = 'normal' | 'wide';
export type DyslexiaContrastMode = 'dark' | 'softer-dark' | 'cream' | 'light';
export type DyslexiaReadingAid = 'none' | 'bionic' | 'ruler';
export type DyslexiaReadAloudRate = 'slow' | 'normal' | 'fast';

export interface DyslexiaSettings {
  /** Master toggle for all dyslexia accommodations */
  enabled: boolean;
  /** Preferred font family — `atkinson` and `open-dyslexic` are bundled alternatives */
  fontFamily: DyslexiaFontFamily;
  /** Line height multiplier (normal 1.4, relaxed 1.6, loose 1.8) */
  lineHeight: DyslexiaLineHeight;
  /** Letter spacing on prose (normal 0em, wide 0.08em) */
  letterSpacing: DyslexiaLetterSpacing;
  /** Word spacing on prose (normal 0em, wide 0.16em) */
  wordSpacing: DyslexiaLetterSpacing;
  /** Background/foreground contrast mode */
  contrastMode: DyslexiaContrastMode;
  /** Reading aid overlay — bionic bolding, ruler line, or none */
  readingAid: DyslexiaReadingAid;
  /** Show a floating "Read this screen" button that uses Web Speech API */
  readAloudEnabled: boolean;
  /** Speech rate for read-aloud */
  readAloudRate: DyslexiaReadAloudRate;
  /** Show a thin reading-progress bar on long screens */
  showReadingProgress: boolean;
  /** Show discoverable keyboard shortcut hints */
  showShortcutHints: boolean;
}

export const DYSLEXIA_DEFAULTS: DyslexiaSettings = {
  enabled: false,
  fontFamily: 'default',
  lineHeight: 'normal',
  letterSpacing: 'normal',
  wordSpacing: 'normal',
  contrastMode: 'dark',
  readingAid: 'none',
  readAloudEnabled: false,
  readAloudRate: 'normal',
  showReadingProgress: false,
  showShortcutHints: true,
};

export const DYSLEXIA_LINE_HEIGHTS: Record<DyslexiaLineHeight, number> = {
  normal: 1.4,
  relaxed: 1.6,
  loose: 1.8,
};

export const DYSLEXIA_LETTER_SPACING: Record<DyslexiaLetterSpacing, string> = {
  normal: '0',
  wide: '0.08em',
};

export const DYSLEXIA_WORD_SPACING: Record<DyslexiaLetterSpacing, string> = {
  normal: '0',
  wide: '0.16em',
};

export const DYSLEXIA_READ_ALOUD_RATES: Record<DyslexiaReadAloudRate, number> = {
  slow: 0.8,
  normal: 1.0,
  fast: 1.25,
};

export const DYSLEXIA_FONT_FAMILIES: Record<DyslexiaFontFamily, string> = {
  default: "'Inter', 'Segoe UI', system-ui, sans-serif",
  atkinson: "'Atkinson Hyperlegible', 'Inter', system-ui, sans-serif",
  'open-dyslexic': "'OpenDyslexic', 'Atkinson Hyperlegible', 'Inter', system-ui, sans-serif",
  lexie: "'Lexie Readable', 'Atkinson Hyperlegible', 'Inter', system-ui, sans-serif",
};
