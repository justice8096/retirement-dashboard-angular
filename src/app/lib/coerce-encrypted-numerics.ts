/**
 * Encrypted-at-rest numeric fields arrive from the API as strings because
 * AES-256-GCM ciphertext is stored in String columns in Prisma, and the
 * decryption pass returns the plaintext as a JavaScript string even when it
 * conceptually represents a number.
 *
 * This module coerces those specific fields back to `number` at the HTTP
 * boundary so downstream signals / arithmetic / `.toFixed()` calls don't
 * silently concatenate strings or produce NaN.
 *
 * See retirement-api/prisma/schema.prisma — every field commented
 * "Encrypted at rest (AES-256-GCM)" is in this set.
 */
import { FinancialSettings, HouseholdProfile } from '@models/api.model';

/** Convert an unknown (string | number | null | undefined) to a finite
 *  number, returning null when the input is empty or unparseable. */
function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function coerceHousehold(h: HouseholdProfile): HouseholdProfile {
  return {
    ...h,
    targetAnnualIncome: toNum(h.targetAnnualIncome) ?? 0,
    members: (h.members ?? []).map(m => ({
      ...m,
      ssPia: toNum(m.ssPia),
    })),
  };
}

export function coerceFinancial(f: FinancialSettings): FinancialSettings {
  // The `*Balance` fields on FinancialSettings are declared `number`
  // in the dashboard model but arrive as strings from the encrypted-at-rest
  // columns. Cast through `unknown` to satisfy the type-assertion shape.
  const raw = f as unknown as Record<string, unknown>;
  return {
    ...f,
    portfolioBalance: toNum(raw['portfolioBalance']) ?? 0,
    traditionalBalance: toNum(raw['traditionalBalance']) ?? null,
    rothBalance:        toNum(raw['rothBalance'])        ?? null,
    taxableBalance:     toNum(raw['taxableBalance'])     ?? null,
    hsaBalance:         toNum(raw['hsaBalance'])         ?? null,
  } as FinancialSettings;
}
