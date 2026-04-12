export type NumberFormat = 'standard' | 'spaced' | 'words';
export type PercentageDisplay = 'standard' | 'natural' | 'proportion' | 'none';
export type ChartStyle = 'bar' | 'bar-labeled';
export type NumberSpacing = 'normal' | 'wide' | 'grouped';
export type ProgressStyle = 'bar' | 'steps' | 'checklist';

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
  /** Chart type preference — bar only, no pie charts */
  chartStyle: ChartStyle;
  /** Show real-world comparisons for dollar amounts */
  magnitudeAnchors: boolean;
  /** Letter-spacing between digits */
  numberSpacing: NumberSpacing;
  /** How progress is shown: bar, step counter, or checklist */
  progressStyle: ProgressStyle;
  /** Disable animated number counters and ticker effects */
  reduceAnimations: boolean;
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
};
