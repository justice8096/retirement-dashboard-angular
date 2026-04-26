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
   * Structured citations for the tax rates on this location. Injected by
   * retirement-api from its `shared/country-tax-sources.js` map based on
   * `loc.country` at read time — the seed data doesn't carry these
   * per-location. See Todos #11.
   */
  sources?: Source[];
}
