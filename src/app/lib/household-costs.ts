/**
 * Per-year household cost curves — pets and dependents.
 *
 * Pure builders that turn household composition (pets with lifespans,
 * dependent members with birth years) plus per-location pet cost data into
 * the sparse per-year arrays consumed by the Monte Carlo kernel
 * (`MonteCarloParams.petCostByYear` / `dependentCostByYear`). All amounts
 * are ANNUAL USD in today's dollars — the kernel applies cumulative
 * inflation at deduction time.
 *
 * Design: docs/superpowers/specs/2026-08-21-pet-dependent-cost-curves-design.md
 */

/** The location.json monthlyCosts categories that describe pet costs.
 *  Callers that enable a pet curve must EXCLUDE these from the flat
 *  segment baseCost — the curve replaces them. */
export const PET_COST_CATEGORY_KEYS = ['petCare', 'petDaycare', 'petGrooming'] as const;

/** Vet/care costs rise for senior pets — applied to a pet's share during
 *  its senior window (the last quarter of expected lifespan). */
export const SENIOR_PET_UPLIFT = 1.25;
export const SENIOR_PET_FRACTION = 0.75;

export const DEFAULT_CHILD_SUPPORT_UNTIL_AGE = 22;
export const DEFAULT_DEPENDENT_MONTHLY_COST = 1000;

export interface PetForCurve {
  /** 'dog' | 'cat' | ... — labeling only in v1; costs are an even split. */
  type?: string | null;
  birthYear: number;
  /** Expected lifespan in years. */
  expectedLifespan: number;
}

export interface DependentForCurve {
  /** 'child' dependents age out at childSupportUntilAge; 'adult'
   *  dependents are supported for the whole horizon. null/undefined is
   *  treated as child. */
  dependentType?: string | null;
  birthYear: number;
}

export interface PetCurveOptions {
  years: number;
  simStartYear: number;
  /** Total household pet monthly cost (sum of PET_COST_CATEGORY_KEYS
   *  `typical` values, today's USD) at the location active in sim year y. */
  petMonthlyTotalAtYear: (y: number) => number;
  /** When true, a pet's base share continues after its expected death —
   *  modeling a successor pet (no senior uplift for the successor). */
  replacePets?: boolean;
}

export interface DependentCurveOptions {
  years: number;
  simStartYear: number;
  monthlyCostPerDependent: number;
  childSupportUntilAge?: number;
}

/** Annual USD pet cost per sim year. Even split of the household total
 *  across the pets supplied; each share runs while its pet is alive,
 *  senior-uplifted in the last quarter of expected lifespan, and ends at
 *  expected death (or continues at base rate with replacePets). A pet
 *  already past its expectancy still gets sim year 0 — it exists. */
export function buildPetCostByYear(pets: PetForCurve[], opts: PetCurveOptions): number[] {
  const { years, simStartYear, petMonthlyTotalAtYear } = opts;
  const curve = new Array<number>(Math.max(0, years)).fill(0);
  if (!pets.length) return curve;
  for (let y = 0; y < years; y++) {
    const share = petMonthlyTotalAtYear(y) / pets.length;
    if (!(share > 0)) continue;
    const calYear = simStartYear + y;
    let total = 0;
    for (const pet of pets) {
      if (calYear < pet.birthYear) continue; // not yet born / acquired
      const lifespan = Math.max(1, pet.expectedLifespan);
      const deathCalYear = Math.max(pet.birthYear + lifespan, simStartYear + 1);
      if (calYear < deathCalYear) {
        const age = calYear - pet.birthYear;
        const senior = age >= SENIOR_PET_FRACTION * lifespan;
        total += share * (senior ? SENIOR_PET_UPLIFT : 1);
      } else if (opts.replacePets) {
        total += share;
      }
    }
    curve[y] = total * 12;
  }
  return curve;
}

/** Annual USD dependent cost per sim year. Children age out the year they
 *  turn childSupportUntilAge; adult dependents run the whole horizon. */
export function buildDependentCostByYear(
  dependents: DependentForCurve[],
  opts: DependentCurveOptions,
): number[] {
  const { years, simStartYear, monthlyCostPerDependent } = opts;
  const untilAge = opts.childSupportUntilAge ?? DEFAULT_CHILD_SUPPORT_UNTIL_AGE;
  const curve = new Array<number>(Math.max(0, years)).fill(0);
  if (!dependents.length || !(monthlyCostPerDependent > 0)) return curve;
  for (let y = 0; y < years; y++) {
    const calYear = simStartYear + y;
    let count = 0;
    for (const dep of dependents) {
      if (calYear < dep.birthYear) continue;
      const isAdult = dep.dependentType === 'adult';
      if (isAdult || calYear - dep.birthYear < untilAge) count++;
    }
    curve[y] = count * monthlyCostPerDependent * 12;
  }
  return curve;
}
