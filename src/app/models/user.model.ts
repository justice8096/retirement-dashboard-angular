export type UserTier = 'free' | 'basic' | 'premium' | 'admin';

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  tier: UserTier;
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
