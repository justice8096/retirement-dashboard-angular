export type StrategyType = 'fixed' | 'constant' | 'guardrails' | 'vpw' | 'bucket' | 'floor-ceiling';
export type SpendingModel = 'level' | 'smile' | 'declining' | 'essential-first';

export interface WithdrawalStrategy {
  strategyType: StrategyType;
  withdrawalRate: number;
  ceilingRate: number | null;
  floorRate: number | null;
  adjustmentPct: number | null;
  bucket1Years: number | null;
  bucket2Years: number | null;
  refillThreshold: number | null;
  essentialSpending: number | null;
  discretionaryBudget: number | null;
  maxDiscretionaryRate: number | null;
  spendingModel: SpendingModel;
  declineRate: number | null;
  rothConversionEnabled: boolean;
  rothConversionAmount: number | null;
  rothConversionEndAge: number | null;
  updatedAt: string;
}
