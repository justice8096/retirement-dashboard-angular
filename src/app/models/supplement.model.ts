import type { Source } from './shared.model';

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
  sources?: Source[];
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
  sources?: Source[];
}

/* ─── Supplement: Inclusion ─────────────────────────────────────── */
export interface InclusionCategory {
  score: number;
  summary: string;
  legalProtections?: string[];
  positiveFactors?: string[];
  riskFactors?: string[];
  sources?: Source[];
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
  webcams?: { name: string; url: string; description?: string }[];
  bloggers?: { name: string; url: string; description?: string }[];
  officialSites?: { name: string; url: string; description?: string }[];
  youtubeChannels?: { name: string; url: string; description?: string }[];
}
