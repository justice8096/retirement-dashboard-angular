/* ─── Pagination ─────────────────────────────────────────────────────── */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/* ─── Locations ──────────────────────────────────────────────────────── */
export interface LocationSummary {
  id: string;
  version: number;
  name: string;
  country: string;
  region: string;
  currency: string;
  monthlyCostTotal: number;
  updatedAt: string;
}

export interface CostRange {
  typical: number;
  min: number;
  max: number;
  annualInflation?: number;
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

export interface HealthcareInfo {
  system: string;
  qualityRating: number;
  dentalIncluded: boolean;
  waitTimes: string;
  prescriptionCoverage: string;
}

export interface LifestyleInfo {
  internetSpeed: string;
  dogFriendly: number;
  expatCommunity: number;
  englishPrevalence: number;
  safetyRating: number;
}

export interface TaxInfo {
  notes: string;
  vatRate: number;
  socialChargesRate: number;
}

export interface VisaInfo {
  type: string;
  duration?: string;
  renewalProcess?: string;
  costUSD?: number;
}

export interface ClimateInfo {
  type: string;
  avgTemp?: { high: number; low: number };
}

export interface LocationFull {
  id: string;
  name: string;
  country: string;
  region: string;
  cities?: string[];
  currency: string;
  exchangeRate?: number;
  visa?: VisaInfo;
  climate?: ClimateInfo;
  monthlyCosts: MonthlyCosts;
  healthcare?: HealthcareInfo;
  lifestyle?: LifestyleInfo;
  pros?: string[];
  cons?: string[];
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
}

export const COST_CATEGORIES: CostCategoryMeta[] = [
  { key: 'rent', label: 'Housing', icon: '🏠', color: '#D4943A', screenId: 'housing' },
  { key: 'groceries', label: 'Groceries', icon: '🛒', color: '#5C9CE6', screenId: 'groceries' },
  { key: 'medicine', label: 'Medicine', icon: '💊', color: '#E57373', screenId: 'medicine' },
  { key: 'healthcare', label: 'Healthcare', icon: '🏥', color: '#4CAF50' },
  { key: 'medicalOOP', label: 'Medical OOP', icon: '🩺', color: '#2A7B7B' },
  { key: 'insurance', label: 'Insurance', icon: '🛡️', color: '#8B9DC3' },
  { key: 'transportation', label: 'Transportation', icon: '🚗', color: '#9C6FDE', screenId: 'transport' },
  { key: 'entertainment', label: 'Entertainment', icon: '🎭', color: '#E8B86D', screenId: 'entertainment' },
  { key: 'phoneCell', label: 'Cell Phones', icon: '📱', color: '#5A6F94', screenId: 'cellphones' },
  { key: 'personalCare', label: 'Personal Care', icon: '💇', color: '#D4943A', screenId: 'personalcare' },
  { key: 'clothing', label: 'Clothing', icon: '👔', color: '#5C9CE6' },
  { key: 'subscriptions', label: 'Subscriptions', icon: '📺', color: '#9C6FDE' },
  { key: 'utilities', label: 'Utilities', icon: '💡', color: '#4CAF50' },
  { key: 'petCare', label: 'Pet Care', icon: '🐾', color: '#E8B86D' },
  { key: 'miscellaneous', label: 'Miscellaneous', icon: '📦', color: '#8B9DC3' },
  { key: 'buffer', label: 'Buffer', icon: '🔒', color: '#5A6F94' },
  { key: 'taxes', label: 'Taxes', icon: '🏛️', color: '#E57373' },
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
    sources: string[];
  };
  groceries?: {
    categories: { name: string; items: { item: string; price: number }[] }[];
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
    stores: { name: string; type: string; priceLevel: string }[];
  };
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

/* ─── User ───────────────────────────────────────────────────────────── */
export type UserTier = 'free' | 'basic' | 'premium' | 'admin';

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  tier: UserTier;
  createdAt: string;
  updatedAt: string;
}

/* ─── Household ──────────────────────────────────────────────────────── */
export type MemberRole = 'primary' | 'spouse' | 'dependent';
export type DependentType = 'adult' | 'child';
export type PetType = 'dog' | 'cat' | 'bird' | 'rabbit' | 'fish' | 'horse' | 'reptile';
export type FeedingMode = 'commercial' | 'homemade';

export interface HouseholdMember {
  id: string;
  role: MemberRole;
  dependentType: DependentType | null;
  name: string;
  birthYear: number;
  ssPia: number | null;
  ssFra: number | null;
  ssClaimAge: number | null;
  sortOrder: number;
}

export interface HouseholdPet {
  id: string;
  name: string;
  type: PetType;
  breed: string | null;
  size: string | null;
  weight: number;
  weightTier: string;
  feedingMode: FeedingMode;
  birthYear: number;
  expectedLifespan: number;
  sortOrder: number;
}

export interface HouseholdProfile {
  id: string;
  adultsCount: number;
  targetAnnualIncome: number;
  planningStartYear: number;
  planningYears: number;
  requirements: string[];
  members: HouseholdMember[];
  pets: HouseholdPet[];
  createdAt: string;
  updatedAt: string;
}

/* ─── Financial ──────────────────────────────────────────────────────── */
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
  updatedAt: string;
}

/* ─── Withdrawal ─────────────────────────────────────────────────────── */
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

/* ─── Scenarios ──────────────────────────────────────────────────────── */
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

/* ─── Billing ────────────────────────────────────────────────────────── */
export interface BillingStatus {
  tier: UserTier;
  featureUnlocks: string[];
  purchasedReleases: number[];
  latestRelease: number | null;
  isFoundingMember: boolean;
  badges: string[];
}

/* ─── Badges ─────────────────────────────────────────────────────────── */
export interface Badge {
  key: string;
  name: string;
  description: string;
  icon: string;
  awardedAt: string | null;
}

/* ─── Contributions ──────────────────────────────────────────────────── */
export type ContributionType = 'cost_correction' | 'new_location' | 'review_rating' | 'supplemental_data';
export type ContributionStatus = 'pending' | 'approved' | 'rejected';

export interface Contribution {
  id: string;
  type: ContributionType;
  status: ContributionStatus;
  locationId: string | null;
  title: string;
  data: Record<string, unknown>;
  createdAt: string;
}

export interface ContributionProgress {
  approvedCount: number;
  basicThreshold: number;
  premiumThreshold: number;
  basicUnlocked: boolean;
  premiumUnlocked: boolean;
}

/* ─── Supplement: Neighborhoods ─────────────────────────────────── */
export interface NeighborhoodHousing {
  avgRentOneBedroomEUR?: number;
  avgRentTwoBedroomEUR?: number;
  buyPricePerSqmEUR?: number;
  predominantType?: string;
}

export interface Neighborhood {
  id: string;
  name: string;
  description: string;
  character: string;
  housing: NeighborhoodHousing;
  walkabilityScore: number;
  transitScore: number;
  safetyRating: string;
  expats: { communitySize: string; englishPrevalence: string };
  character_notes?: string;
  sources?: { title: string; url: string }[];
}

export interface NeighborhoodsSupplement {
  city: string;
  neighborhoods: Neighborhood[];
}

/* ─── Supplement: Services ──────────────────────────────────────── */
export interface LocalService {
  categoryId: string;
  name: string;
  address?: string;
  distanceKm?: number;
  notes?: string;
  sources?: { title: string; url: string }[];
}

/* ─── Supplement: Inclusion ─────────────────────────────────────── */
export interface InclusionCategory {
  score: number;
  summary: string;
  legalProtections?: string[];
  positiveFactors?: string[];
  riskFactors?: string[];
  sources?: { title: string; url: string }[];
}

export interface InclusionSupplement {
  overall?: { score: number; summary: string };
  racial?: InclusionCategory;
  religious?: InclusionCategory;
  countryOfOrigin?: InclusionCategory;
  lgbtq?: InclusionCategory;
  disability?: InclusionCategory;
  age?: InclusionCategory;
  [key: string]: InclusionCategory | { score: number; summary: string } | undefined;
}

/* ─── Supplement: Local Info ────────────────────────────────────── */
export interface LocalInfoSupplement {
  webcams?: { title: string; url: string }[];
  bloggers?: { title: string; url: string }[];
  officialSites?: { title: string; url: string }[];
  youtubeChannels?: { title: string; url: string }[];
}
