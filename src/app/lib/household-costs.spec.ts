import { describe, it, expect } from 'vitest';
import {
  buildPetCostByYear, buildDependentCostByYear,
  SENIOR_PET_UPLIFT, PET_COST_CATEGORY_KEYS,
} from './household-costs';

const flat = (n: number) => () => n;

describe('buildPetCostByYear', () => {
  it('returns all-zero curve for empty pet list', () => {
    expect(buildPetCostByYear([], { years: 5, simStartYear: 2026, petMonthlyTotalAtYear: flat(640) }))
      .toEqual([0, 0, 0, 0, 0]);
  });

  it('runs a pet share while alive, senior-uplifts the last quarter of lifespan, ends at expected death', () => {
    // Dog born 2018, lifespan 12 → death cal year 2030 → alive sim years 0-3.
    // Senior at age ≥ 9 (0.75 × 12): y0 age 8 base, y1-y3 ages 9-11 uplifted.
    const curve = buildPetCostByYear(
      [{ type: 'dog', birthYear: 2018, expectedLifespan: 12 }],
      { years: 6, simStartYear: 2026, petMonthlyTotalAtYear: flat(640) },
    );
    expect(curve[0]).toBeCloseTo(640 * 12);
    expect(curve[1]).toBeCloseTo(640 * 12 * SENIOR_PET_UPLIFT);
    expect(curve[3]).toBeCloseTo(640 * 12 * SENIOR_PET_UPLIFT);
    expect(curve[4]).toBe(0);
    expect(curve[5]).toBe(0);
  });

  it('replacePets keeps the base share running after death (no senior uplift)', () => {
    const curve = buildPetCostByYear(
      [{ birthYear: 2018, expectedLifespan: 12 }],
      { years: 6, simStartYear: 2026, petMonthlyTotalAtYear: flat(640), replacePets: true },
    );
    expect(curve[4]).toBeCloseTo(640 * 12);
    expect(curve[5]).toBeCloseTo(640 * 12);
  });

  it('a pet already past its expectancy still gets sim year 0, senior-uplifted', () => {
    const curve = buildPetCostByYear(
      [{ birthYear: 2010, expectedLifespan: 12 }],
      { years: 3, simStartYear: 2026, petMonthlyTotalAtYear: flat(400) },
    );
    expect(curve[0]).toBeCloseTo(400 * 12 * SENIOR_PET_UPLIFT);
    expect(curve[1]).toBe(0);
  });

  it('splits the household total evenly across pets and drops each share independently', () => {
    // Pet A: born 2026, lifespan 2 → death 2028 → alive sim years 0-1.
    // Pet B: born 2026, lifespan 10 → alive all 4 years, senior from age 7.5 (never in window here).
    const curve = buildPetCostByYear(
      [{ birthYear: 2026, expectedLifespan: 2 }, { birthYear: 2026, expectedLifespan: 10 }],
      { years: 4, simStartYear: 2026, petMonthlyTotalAtYear: flat(600) },
    );
    expect(curve[0]).toBeCloseTo(600 * 12); // both alive at base rate
    expect(curve[2]).toBeCloseTo(300 * 12); // only B
    expect(curve[3]).toBeCloseTo(300 * 12);
  });

  it('uses the location active at each year via petMonthlyTotalAtYear', () => {
    const curve = buildPetCostByYear(
      [{ birthYear: 2026, expectedLifespan: 20 }],
      { years: 4, simStartYear: 2026, petMonthlyTotalAtYear: (y) => (y < 2 ? 600 : 250) },
    );
    expect(curve[0]).toBeCloseTo(600 * 12);
    expect(curve[2]).toBeCloseTo(250 * 12);
  });

  it('exports the pet cost category keys used to exclude the flat baseCost inclusion', () => {
    expect(PET_COST_CATEGORY_KEYS).toEqual(['petCare', 'petDaycare', 'petGrooming']);
  });
});

describe('buildDependentCostByYear', () => {
  it('child dependents age out the year they turn childSupportUntilAge', () => {
    // Born 2010, untilAge 22 → supported while age < 22 → sim years 0-5 (ages 16-21).
    const curve = buildDependentCostByYear(
      [{ dependentType: 'child', birthYear: 2010 }],
      { years: 8, simStartYear: 2026, monthlyCostPerDependent: 1000 },
    );
    expect(curve[0]).toBe(12000);
    expect(curve[5]).toBe(12000);
    expect(curve[6]).toBe(0);
  });

  it('adult dependents run the whole horizon; null dependentType is treated as child', () => {
    const curve = buildDependentCostByYear(
      [{ dependentType: 'adult', birthYear: 1990 }, { dependentType: null, birthYear: 2010 }],
      { years: 8, simStartYear: 2026, monthlyCostPerDependent: 500 },
    );
    expect(curve[0]).toBe(12000); // both
    expect(curve[7]).toBe(6000);  // adult only — child aged out
  });

  it('returns zeros for no dependents or non-positive rate', () => {
    expect(buildDependentCostByYear([], { years: 2, simStartYear: 2026, monthlyCostPerDependent: 1000 }))
      .toEqual([0, 0]);
    expect(buildDependentCostByYear([{ birthYear: 2010 }], { years: 2, simStartYear: 2026, monthlyCostPerDependent: 0 }))
      .toEqual([0, 0]);
  });
});
