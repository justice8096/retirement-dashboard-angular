export type RetirementPath = 'traditional' | 'fire' | 'explore';

import type { RentalProperty } from '@app/lib/rental-income';

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
  /** Rental property portfolio (Todo #36). JSONB-persisted on the api
   *  (`user_financial_settings.rental_properties`). Empty array when no
   *  properties configured. */
  rentalProperties?: RentalProperty[];
  /** Primary-residence mortgage P+I per month, USD (Todo #28). Sticky —
   *  the MC kernel does NOT inflate this with CPI (mortgage payments
   *  are nominal). 0 = no mortgage configured. */
  mortgageMonthlyPayment?: number;
  /** Sim-year (exclusive) when the mortgage ends. 0 = no mortgage.
   *  Early payoff is modeled by setting this to the payoff year and
   *  adding a oneTimeExpense LifeEvent for the remaining principal. */
  mortgageEndYear?: number;
  /** First-year ACA transition extra income (Todo #38). One-shot MAGI
   *  bump in sim year 0 only — severance, unused PTO, final-year
   *  bonuses, year-of-retirement RMDs. 0 = no transition spike. */
  transitionYearExtraIncome?: number;
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
