export type ScenarioType = 'deterministic' | 'monte_carlo' | 'historical';

export interface Scenario {
  id: string;
  name: string;
  scenarioData: Record<string, unknown>;
  scenarioType: ScenarioType;
  successRate: number | null;
  medianBalance: number | null;
  p10Balance: number | null;
  p90Balance: number | null;
  simulationRuns: number | null;
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
}
