import type { Source } from './shared.model';

export interface TaxBracket {
  min: number;
  max: number | null;
  rate: number;
}

export interface IncomeTaxTable {
  applies?: boolean;
  rate?: number;
  type?: string;
  brackets: TaxBracket[];
  /** Standard/default deduction before bracket application. */
  standardDeduction?: number;
  /** Additional deduction amount (e.g. state-level). */
  deduction?: number;
  exemptions?: string;
}

export interface SalesTaxInfo {
  rate: number;
  notes?: string;
}

export interface PropertyTaxInfo {
  rate: number;
  notes?: string;
}

/**
 * Inheritance / estate tax info. Phase 1 of the foreign-inheritance-tax
 * data layer populates `notes` and `sources` only; structured fields
 * (`topRate`, `exemptionLocal`, `spouseExemption`, `basis`,
 * `scopeWhenResident`) are filled in Phase 2 for high-impact countries.
 * Injected by retirement-api from `shared/country-inheritance-tax.js`
 * keyed on `loc.country` at read time — the seed data doesn't carry
 * these per-location.
 *
 * Per-relationship rate tables, treaty interactions, and wealth taxes
 * are intentionally out of scope for this layer.
 */
export interface InheritanceTaxInfo {
  /** Whether the spouse inherits free of tax. */
  spouseExemption?: 'full' | 'partial' | 'none';
  /** Top marginal rate, as a fraction 0..1. */
  topRate?: number;
  /** Threshold below which no tax owed, in local currency. */
  exemptionLocal?: number;
  /** 'estate' (taxed at the estate, US/UK pattern) vs 'inheritance'
   *  (taxed at the recipient, most of Europe / Latin America). */
  basis?: 'estate' | 'inheritance';
  /** Whether residence-based (worldwide assets) or situs-based
   *  (local-only assets) when deceased was a resident. */
  scopeWhenResident?: 'worldwide' | 'local-only';
  /** Free-text caveats — regional variation, per-relationship rate
   *  differences, treaty notes, recent reforms. */
  notes?: string;
  sources?: Source[];
}

export interface TaxInfo {
  notes?: string;
  vatRate?: number;
  socialChargesRate?: number;
  /** US federal income tax brackets. */
  federalIncomeTax?: IncomeTaxTable;
  /** US state (or regional) income tax brackets. */
  stateIncomeTax?: IncomeTaxTable;
  salesTax?: SalesTaxInfo;
  propertyTax?: PropertyTaxInfo;
  estVehicleTax?: number;
  ssExempt?: boolean;
  ssTaxedInCountry?: boolean;
  socialCharges?: unknown;
  /**
   * Inheritance / estate tax info — country-keyed. Injected by
   * retirement-api at read time from `shared/country-inheritance-tax.js`.
   * Phase 1: notes + sources only. Phase 2 will add structured rates.
   */
  inheritance?: InheritanceTaxInfo;
  /**
   * Structured citations for the tax rates on this location. Injected by
   * retirement-api from its `shared/country-tax-sources.js` map based on
   * `loc.country` at read time — the seed data doesn't carry these
   * per-location. See Todos #11.
   */
  sources?: Source[];
}
