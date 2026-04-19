export type NumberFormat = 'standard' | 'spaced' | 'words';
export type PercentageDisplay = 'standard' | 'natural' | 'proportion' | 'none';
export type ChartStyle = 'bar' | 'bar-labeled' | 'concrete';
export type NumberSpacing = 'normal' | 'wide' | 'grouped';
export type ProgressStyle = 'bar' | 'steps' | 'checklist';
/** Monte Carlo reveal mode: 'full' shows every card at once, 'calm' gates them
 *  behind a Next button. Dashboard Dyscalculia F-006. */
export type McMode = 'full' | 'calm';

export interface DyscalculiaSettings {
  /** Master toggle for all dyscalculia accommodations */
  enabled: boolean;
  /** How numbers are displayed: standard commas, spaced groups, or full words */
  numberFormat: NumberFormat;
  /** Round dollar amounts to the nearest $100 */
  roundNumbers: boolean;
  /** Show plain-language descriptions alongside numbers */
  showTextSummaries: boolean;
  /** How percentages are presented */
  percentageDisplay: PercentageDisplay;
  /** Chart type preference — bar, labeled bar, or concrete tile visual */
  chartStyle: ChartStyle;
  /** Show real-world comparisons for dollar amounts */
  magnitudeAnchors: boolean;
  /** Letter-spacing between digits */
  numberSpacing: NumberSpacing;
  /** How progress is shown: bar, step counter, or checklist */
  progressStyle: ProgressStyle;
  /** Disable animated number counters and ticker effects */
  reduceAnimations: boolean;
  /** Monte Carlo result reveal pace — 'full' all at once, 'calm' one-by-one */
  mcMode: McMode;
  /** Show a microphone button next to currency inputs that dictates the number
   *  via the browser's Web Speech API. Dashboard Dyscalculia F-008. */
  voiceEntry: boolean;
}

export const DYSCALCULIA_DEFAULTS: DyscalculiaSettings = {
  enabled: false,
  numberFormat: 'standard',
  roundNumbers: false,
  showTextSummaries: true,
  percentageDisplay: 'standard',
  chartStyle: 'bar',
  magnitudeAnchors: false,
  numberSpacing: 'normal',
  progressStyle: 'bar',
  reduceAnimations: false,
  mcMode: 'full',
  voiceEntry: false,
};
