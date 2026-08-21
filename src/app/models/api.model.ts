/**
 * Barrel re-export of all API models, split by domain.
 *
 * Historically this file held every interface in one ~628-LOC blob (53
 * exports). The 2026-04-25 complexity audit flagged it as the only
 * top-10 oversized file that's pure data shapes, with natural domain
 * boundaries already marked by section comments. Splitting per-domain
 * keeps each file focused (~50–250 LOC) and makes the dependency
 * structure explicit (location → tax → shared, etc.).
 *
 * This barrel preserves the existing `from '../../models/api.model'`
 * import path used by 37 call sites — no churn at the import layer.
 * New code can import directly from a specific domain file
 * (`'../../models/location.model'`) when only one domain is needed.
 */
export * from './shared.model';
export * from './tax.model';
export * from './location.model';
export * from './household.model';
export * from './financial.model';
export * from './withdrawal.model';
export * from './scenario.model';
export * from './user.model';
export * from './supplement.model';
export * from './groceries.model';
export * from './admin-location.model';
