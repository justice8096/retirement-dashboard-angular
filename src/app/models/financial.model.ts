export type RetirementPath = 'traditional' | 'fire' | 'explore';

export interface FinancialSettings {
  portfolioBalance: number;
  fxDriftEnabled: boolean;
  fxDriftAnnualRate: number;
  ssCutEnabled: boolean;
  ssCutYear: number;
  ssCola: number;
  equityPct: number;
  bondPct: number;
  cashPct: number;
  intlPct: number;
  expectedReturn: number;
  expectedInflation: number;
  retirementPath: RetirementPath;
  fireTargetAge: number | null;
  annualSavings: number | null;
  savingsRate: number | null;
  traditionalBalance: number | null;
  rothBalance: number | null;
  taxableBalance: number | null;
  hsaBalance: number | null;
  /** Per-account load % (recurring annual drag). Whole-number percent, e.g. 0.5 = 0.5%. */
  traditionalLoadPct?: number;
  rothLoadPct?: number;
  taxableLoadPct?: number;
  hsaLoadPct?: number;
  /** Per-account annual fees % / expense ratio. Whole-number percent. */
  traditionalFeesPct?: number;
  rothFeesPct?: number;
  taxableFeesPct?: number;
  hsaFeesPct?: number;
  updatedAt: string;
}

/* --- Brokerage & Transfer Fees --- */
export type FxProvider = 'bank' | 'wise' | 'ofx' | 'xe' | 'other';

export interface BrokerageFees {
  // Stock brokerage fees (percentages as whole numbers, e.g. 0.5 = 0.5%)
  brokerageFeePct: number;
  brokerageFeeFlat: number;
  brokerageAnnualFee: number;
  brokerageExpenseRatio: number;

  // Wire / ACH transfer fees (USD)
  wireTransferFeeUsd: number;
  wireTransferFeeLocal: number;
  achTransferFee: number;

  // Currency exchange fees
  fxSpreadPct: number;
  fxFixedFee: number;
  fxProvider: FxProvider;

  // Currency settings
  localCurrency: string;
  manualExchangeRate: number | null;

  updatedAt: string;
}

/* --- Currency Conversion Helpers --- */
export interface CurrencyConversion {
  fromCurrency: string;
  toCurrency: string;
  exchangeRate: number;
  fxSpreadPct: number;
  fxFixedFee: number;
  wireTransferFee: number;
  amountUsd: number;
  amountLocal: number;
  totalFeesUsd: number;
  netAmountLocal: number;
}
