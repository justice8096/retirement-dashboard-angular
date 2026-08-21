import type { Source, ProConBullet } from './shared.model';
import type { TaxInfo } from './tax.model';

export interface LocationSummary {
  id: string;
  version: number;
  name: string;
  country: string;
  region: string;
  /** Optional state / province / department within `region`. Added
   *  2026-04-20 as part of the region-taxonomy normalization (FU-001).
   *  Present on US locations, France regions, Ireland provinces, etc.;
   *  absent where the source data is macro-region only. */
  subregion?: string;
  currency: string;
  monthlyCostTotal: number;
  updatedAt: string;
}

export interface CostRange {
  typical: number;
  min: number;
  max: number;
  annualInflation?: number;
  /**
   * Structured citations for this category's cost values. Injected by
   * retirement-api from its shared category-cost-sources map at read
   * time — seed data doesn't carry these per-location. Consumers render
   * via <app-source-tooltip>. See Todos #11.
   */
  sources?: Source[];
}

export interface MonthlyCosts {
  rent: CostRange;
  groceries: CostRange;
  utilities: CostRange;
  healthcare: CostRange;
  insurance: CostRange;
  petCare: CostRange;
  petDaycare: CostRange;
  petGrooming: CostRange;
  transportation: CostRange;
  entertainment: CostRange;
  clothing: CostRange;
  personalCare: CostRange;
  subscriptions: CostRange;
  phoneCell: CostRange;
  taxes: CostRange;
  miscellaneous: CostRange;
  medicine: CostRange;
  buffer: CostRange;
  medicalOOP: CostRange;
  [key: string]: CostRange;
}

export interface AcaMarketplaceInfo {
  benchmarkSilverMonthly2Adult?: number;
  benchmarkSilverMonthlySingle?: number;
  /** Enhanced ACA premium cap as fraction of MAGI, e.g. 0.085 = 8.5%. */
  premiumCapPctOfIncome?: number;
  notes?: string;
  /** County / rating area name (for display). */
  rateArea?: string;
  /** How precise the benchmark price is — 'county' = per-county, 'state' = state average. */
  estimationLevel?: 'county' | 'state';
  /** Human-readable caveat shown alongside ACA costs in the UI. */
  disclaimer?: string;
}

export interface HealthcareInfo {
  system: string;
  qualityRating: number;
  dentalIncluded: boolean;
  waitTimes: string;
  prescriptionCoverage: string;
  notes?: string;
  /** ACA marketplace pricing for pre-Medicare retirees. */
  acaMarketplace?: AcaMarketplaceInfo;
}

export interface LifestyleInfo {
  internetSpeed: string;
  dogFriendly: number;
  expatCommunity: number;
  englishPrevalence: number;
  safetyRating: number;
}

export interface VisaInfo {
  type: string;
  notes?: string;
  /** Monthly income threshold for eligibility ({monthly, currency}). */
  incomeRequirement?: { monthly?: number; currency?: string } | null;
  // Legacy fields — not populated in current data but preserved for future use.
  duration?: string;
  renewalProcess?: string;
  costUSD?: number;
}

export interface ClimateInfo {
  winterLowF?: number;
  summerHighF?: number;
  rainyDaysPerYear?: number;
  meetsWarmWinterReq?: boolean;
  // Legacy / alternate shape — not in current data but preserved.
  type?: string;
  avgTemp?: { high: number; low: number };
}

export interface LocationFull {
  id: string;
  name: string;
  country: string;
  region: string;
  /** Optional state / province / department within `region`. See
   *  LocationSummary.subregion for rationale (FU-001). */
  subregion?: string;
  cities?: string[];
  currency: string;
  exchangeRate?: number;
  visa?: VisaInfo;
  climate?: ClimateInfo;
  monthlyCosts: MonthlyCosts;
  healthcare?: HealthcareInfo;
  lifestyle?: LifestyleInfo;
  pros?: ProConBullet[];
  cons?: ProConBullet[];
  taxes?: TaxInfo;
  monthlyCostTotal?: number;
  _version?: number;
}

export type SupplementType = 'neighborhoods' | 'services' | 'inclusion' | 'detailed-costs' | 'local-info';

/* ─── Cost category metadata ─────────────────────────────────────── */
export interface CostCategoryMeta {
  key: string;
  label: string;
  icon: string;
  color: string;
  screenId?: string;
  /**
   * Whether this category is subject to the location's VAT / social charges.
   * Used by the iterative tax-on-total convergence in LocationService.
   */
  taxable?: boolean;
  /**
   * Alternate categories are excluded from default cost sums. Exactly one
   * alternate from a mutually-exclusive group is selected at runtime. Example:
   * `healthcarePreMedicare` is an alternate to `healthcare` — the
   * HealthcareService picks whichever applies based on household ages + income.
   */
  alternate?: boolean;
  /**
   * Whether this category counts as essential / non-discretionary spending.
   * The Guardrails screen uses the sum of essential monthly × 12 as a
   * floor-spending estimate — the dollar amount the household genuinely
   * cannot cut in a bad-sequence year. Categories like entertainment,
   * subscriptions, and clothing are discretionary; rent, food, healthcare,
   * insurance, utilities, and taxes are essential. Default true (most
   * categories tilt essential when in doubt).
   */
  essential?: boolean;
}

export const COST_CATEGORIES: CostCategoryMeta[] = [
  { key: 'rent', label: 'Housing', icon: '🏠', color: '#D4943A', screenId: 'housing', taxable: false, essential: true },
  { key: 'groceries', label: 'Groceries', icon: '🛒', color: '#5C9CE6', screenId: 'groceries', taxable: false, essential: true },
  { key: 'medicine', label: 'Medicine', icon: '💊', color: '#E57373', screenId: 'medicine', taxable: false, essential: true },
  { key: 'healthcare', label: 'Healthcare', icon: '🏥', color: '#4CAF50', taxable: false, essential: true },
  { key: 'healthcarePreMedicare', label: 'Healthcare (Pre-Medicare / ACA)', icon: '🏥', color: '#4CAF50', taxable: false, alternate: true, essential: true },
  { key: 'medicalOOP', label: 'Medical OOP', icon: '🩺', color: '#2A7B7B', taxable: false, essential: true },
  { key: 'insurance', label: 'Insurance', icon: '🛡️', color: '#8B9DC3', taxable: false, essential: true },
  { key: 'transportation', label: 'Transportation', icon: '🚗', color: '#9C6FDE', screenId: 'transport', taxable: true, essential: true },
  { key: 'entertainment', label: 'Entertainment', icon: '🎭', color: '#E8B86D', screenId: 'entertainment', taxable: true, essential: false },
  { key: 'phoneCell', label: 'Cell Phones', icon: '📱', color: '#5A6F94', screenId: 'cellphones', taxable: true, essential: true },
  { key: 'personalCare', label: 'Personal Care', icon: '💇', color: '#D4943A', screenId: 'personalcare', taxable: true, essential: false },
  { key: 'clothing', label: 'Clothing', icon: '👔', color: '#5C9CE6', taxable: true, essential: false },
  { key: 'subscriptions', label: 'Subscriptions', icon: '📺', color: '#9C6FDE', taxable: true, essential: false },
  { key: 'utilities', label: 'Utilities', icon: '💡', color: '#4CAF50', taxable: false, essential: true },
  { key: 'petCare', label: 'Pet Care', icon: '🐾', color: '#E8B86D', taxable: true, essential: false },
  { key: 'miscellaneous', label: 'Miscellaneous', icon: '📦', color: '#8B9DC3', taxable: true, essential: false },
  { key: 'buffer', label: 'Buffer', icon: '🔒', color: '#5A6F94', taxable: false, essential: false },
  { key: 'taxes', label: 'Taxes', icon: '🏛️', color: '#E57373', taxable: false, essential: true },
];

/* ─── Detailed Costs (supplement) ────────────────────────────────── */
export interface DetailedCosts {
  medicine?: {
    monthlyPrescriptionCosts: Record<string, number>;
    commonMedications: { name: string; cost: number }[];
    pharmacyAccess: string;
    notes: string;
  };
  cellPhone?: {
    monthlyBudget: number;
    plans: { provider: string; data: string; cost: number }[];
    /** Carrier plan citations. Seed data (as of 2026-04-22) ships the
     *  Source shape across all 138 detailed-costs.json files. */
    sources: Source[];
  };
  groceries?: {
    categories: GroceryCatalogCategory[];
  };
  housing?: {
    propertyType: string;
    monthlyBudget: number;
    breakdown: Record<string, number>;
    taxNotes: string;
    leaseTerms: string;
  };
  healthcare?: {
    system: string;
    coverageSummary: string;
    gpVisit: number;
    specialist: number;
    privateInsurance: Record<string, number>;
  };
  personalCare?: {
    hairCare: Record<string, number>;
    fitness: Record<string, number>;
    spa: Record<string, number>;
  };
  transportation?: {
    monthlyBudget: number;
    publicTransit: Record<string, number>;
    rideShare: Record<string, number>;
    carOwnership: Record<string, number>;
    walkability: string;
  };
  seniorDiscounts?: {
    minimumAge: number;
    programName: string;
    discounts: { category: string; discount: string }[];
  };
  groceryStores?: {
    stores: { name: string; type: string; website?: string; notes?: string }[];
  };
}

/**
 * One catalog item within a location's `detailed-costs.json` grocery
 * category — the per-location price catalog that `GroceriesService`
 * layers user overrides on top of. `monthlyCost` is the location's
 * baseline price; `forWhom` matches the retired React dashboard's
 * household-attribution tag ('adults' | 'dog' | 'cat' | 'shared', though
 * the field is a free string since seed data isn't enum-constrained).
 */
export interface GroceryCatalogItem {
  name: string;
  monthlyCost: number;
  quantity: number;
  unit?: string;
  forWhom?: string;
  notes?: string;
}

export interface GroceryCatalogCategory {
  id: string;
  name: string;
  items: GroceryCatalogItem[];
}

export interface LocationQuery {
  page?: number;
  limit?: number;
  country?: string;
  region?: string;
  currency?: string;
  search?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  minCost?: number;
  maxCost?: number;
  fields?: 'summary' | 'full';
}
