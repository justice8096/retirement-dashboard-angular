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
  /** Latitude for map placement. Field name matches the retired React
   *  dashboard's `Neighborhood` type (A4 parity port #1); no
   *  neighborhoods.json row carries it yet, but the API passes through
   *  whatever the data file has. */
  lat?: number;
  /** Longitude for map placement. See `lat`. */
  lng?: number;
  /** Explicit external map URL (e.g. a hand-picked Google Maps link),
   *  taking priority over lat/lng-derived URLs when present. */
  mapUrl?: string;
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
