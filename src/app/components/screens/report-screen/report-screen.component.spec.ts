import { describe, it, expect } from 'vitest';
import type { LocationFull, HouseholdProfile, FinancialSettings } from '@models/api.model';
import {
  buildLocationCostsCsv,
  buildTaxComparisonCsv,
  buildScenarioProjectionCsv,
} from './report-screen.component';

/**
 * A4 parity port #4 (CSV export). Tests the three pure CSV-builder
 * functions against representative mocked service state — the same
 * `household`/`financial`/`fullLocations()` shapes `ReportScreenComponent`
 * fetches for the Markdown report. Only the fields each builder actually
 * reads are populated; the rest are cast via `as unknown as T` (same
 * convention as monte-carlo-worker-protocol.spec.ts's representativeParams).
 */

function costRange(typical: number) {
  return { typical, min: typical, max: typical };
}

/** A representative full location — enough of `monthlyCosts` populated to
 *  exercise every column the CSV builders read, plus a bracket-based US
 *  tax profile for the tax-comparison CSV. */
function makeLocation(overrides: Partial<LocationFull> = {}): LocationFull {
  const zero = costRange(0);
  return {
    id: 'us-austin-tx',
    name: 'Austin',
    country: 'United States',
    region: 'South',
    currency: 'USD',
    monthlyCosts: {
      rent: costRange(1800),
      groceries: costRange(500),
      utilities: costRange(180),
      healthcare: costRange(400),
      insurance: zero,
      petCare: zero,
      petDaycare: zero,
      petGrooming: zero,
      transportation: costRange(250),
      entertainment: costRange(150),
      clothing: zero,
      personalCare: zero,
      subscriptions: zero,
      phoneCell: zero,
      taxes: zero,
      miscellaneous: zero,
      medicine: zero,
      buffer: zero,
      medicalOOP: zero,
    },
    lifestyle: {
      internetSpeed: '1Gbps',
      dogFriendly: 8,
      expatCommunity: 6,
      englishPrevalence: 10,
      safetyRating: 7,
    },
    taxes: {
      federalIncomeTax: { brackets: [{ min: 0, max: 100000, rate: 0.12 }] },
      stateIncomeTax: { brackets: [], rate: 0 },
      socialChargesRate: 0.0765,
    },
    monthlyCostTotal: 3280,
    ...overrides,
  } as unknown as LocationFull;
}

function makeHousehold(overrides: Partial<HouseholdProfile> = {}): HouseholdProfile {
  return {
    id: 'hh-1',
    adultsCount: 1,
    targetAnnualIncome: 60000,
    planningStartYear: 2026,
    planningYears: 35,
    requirements: [],
    members: [
      { id: 'm1', role: 'primary', dependentType: null, name: 'Primary', birthYear: 1966, ssPia: null, ssFra: null, ssClaimAge: null, sortOrder: 0 },
    ],
    pets: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  } as unknown as HouseholdProfile;
}

function makeFinancial(overrides: Partial<FinancialSettings> = {}): FinancialSettings {
  return {
    portfolioBalance: 1_000_000,
    expectedReturn: 7,
    expectedInflation: 3,
    retirementPath: 'traditional',
    ...overrides,
  } as unknown as FinancialSettings;
}

describe('buildLocationCostsCsv', () => {
  it('emits the header row and one data row per location', () => {
    const csv = buildLocationCostsCsv([makeLocation()]);
    const lines = csv.split('\n');
    expect(lines[0]).toBe(
      'Name,Country,Currency,Rent,Groceries,Healthcare,Transportation,Entertainment,Utilities,Total Monthly,Total Annual,Safety Rating,Internet Speed',
    );
    expect(lines[1]).toBe('Austin,United States,USD,1800,500,400,250,150,180,3280,39360,7,1Gbps');
    expect(lines.length).toBe(2);
  });

  it('quotes a location name containing a comma', () => {
    const csv = buildLocationCostsCsv([makeLocation({ name: 'Springfield, IL' })]);
    expect(csv.split('\n')[1]!.startsWith('"Springfield, IL"')).toBe(true);
  });

  it('falls back to N/A for missing country/currency/lifestyle fields', () => {
    const bare = makeLocation({ country: '', currency: '', lifestyle: undefined });
    const csv = buildLocationCostsCsv([bare]);
    const cells = csv.split('\n')[1]!.split(',');
    expect(cells[1]).toBe('N/A'); // country
    expect(cells[11]).toBe('N/A'); // safety rating
    expect(cells[12]).toBe('N/A'); // internet speed
  });
});

describe('buildTaxComparisonCsv', () => {
  it('emits the header row and a data row with federal/state/social/total/effective columns', () => {
    const csv = buildTaxComparisonCsv([makeLocation()]);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('Name,Country,Federal Tax,State Tax,Social Charges,Total Tax,Effective Rate');
    // fedRate 0.12 -> 12%, stateRate 0 -> 0%, socialRate 0.0765 -> 7.65%, total 19.65%
    expect(lines[1]).toBe('Austin,United States,12%,0%,7.65%,19.65%,19.65%');
  });

  it('Effective Rate always equals Total Tax (carried over from the React source)', () => {
    const csv = buildTaxComparisonCsv([makeLocation()]);
    const cells = csv.split('\n')[1]!.split(',');
    expect(cells[5]).toBe(cells[6]);
  });

  it('handles a location with no taxes data at all (all rates default to 0)', () => {
    const csv = buildTaxComparisonCsv([makeLocation({ taxes: undefined })]);
    expect(csv.split('\n')[1]).toBe('Austin,United States,0%,0%,0%,0%,0%');
  });
});

describe('buildScenarioProjectionCsv', () => {
  it('emits the header row and 36 rows (year 0 through 35) starting from the household/financial inputs', () => {
    const csv = buildScenarioProjectionCsv(makeLocation(), makeHousehold(), makeFinancial());
    const lines = csv.split('\n');
    expect(lines[0]).toBe('Year,Age,Portfolio,Annual Spending,Net Return,Inflation');
    expect(lines.length).toBe(37); // header + 36 projection years

    const currentYear = new Date().getFullYear();
    const primaryAge = currentYear - 1966;
    const baseCost = 3280 * 12; // monthlyCostTotal * 12
    const year0Spending = Math.round(baseCost * Math.pow(1.03, 0));
    const year0NetReturn = Math.round(1_000_000 * 0.07);
    const year0Portfolio = Math.round(1_000_000 + 1_000_000 * 0.07 - baseCost);

    expect(lines[1]).toBe(`${currentYear},${primaryAge},${year0Portfolio},${year0Spending},${year0NetReturn},1`);
  });

  it('throws when the household has no primary member', () => {
    const noPrimary = makeHousehold({ members: [] });
    expect(() => buildScenarioProjectionCsv(makeLocation(), noPrimary, makeFinancial())).toThrow(
      /primary household member/i,
    );
  });

  it('treats a null financial/household portfolio balance as 0 rather than throwing', () => {
    const csv = buildScenarioProjectionCsv(makeLocation(), makeHousehold(), null);
    const firstRow = csv.split('\n')[1]!.split(',');
    // portfolio 0, net return 0, spending is still baseCost year 0
    expect(firstRow[4]).toBe('0'); // Net Return
  });
});
