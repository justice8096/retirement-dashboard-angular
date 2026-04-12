export type StatUnit = 'currency' | 'count' | 'percentage';

export interface StatData {
  label: string;
  rawValue: string;
  rawNumber: number;
  sub: string;
  unit: StatUnit;
}

export interface ChartDataPoint {
  label: string;
  value: number;
  color: string;
  anchor?: string;
}
