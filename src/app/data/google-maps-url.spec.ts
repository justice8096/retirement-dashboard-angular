import { describe, it, expect } from 'vitest';
import type { Neighborhood } from '@models/api.model';
import { getGoogleMapsUrl } from './google-maps-url';

/**
 * A4 parity port #1 (per-neighborhood map pins + Google Maps links).
 * Covers the URL-building logic ported from the retired React
 * dashboard's `getGoogleMapsUrl` — the coordinate path, the explicit
 * `mapUrl` override, and the no-coords name+city search fallback.
 */

function makeNeighborhood(overrides: Partial<Neighborhood> = {}): Neighborhood {
  return {
    id: 'nh-1',
    name: 'Rittenhouse Square',
    description: 'Upscale residential neighborhood',
    character: 'Upscale urban, park-centered',
    housing: {},
    walkabilityScore: 98,
    transitScore: 85,
    safetyRating: 'high',
    expats: { communitySize: 'small', englishPrevalence: 'high' },
    ...overrides,
  };
}

describe('getGoogleMapsUrl', () => {
  it('builds a coordinate search URL when lat/lng are both present', () => {
    const url = getGoogleMapsUrl(makeNeighborhood({ lat: 39.9496, lng: -75.1719 }), 'Philadelphia');
    expect(url).toBe('https://www.google.com/maps/search/?api=1&query=39.9496,-75.1719');
  });

  it('prefers an explicit mapUrl over coordinates', () => {
    const url = getGoogleMapsUrl(
      makeNeighborhood({ lat: 1, lng: 2, mapUrl: 'https://maps.example/pinned' }),
      'Philadelphia',
    );
    expect(url).toBe('https://maps.example/pinned');
  });

  it('falls back to a name+city text search when coordinates are missing', () => {
    const url = getGoogleMapsUrl(makeNeighborhood({ name: 'Old Town' }), 'Quito');
    expect(url).toBe(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('Old Town, Quito')}`);
  });

  it('falls back to just the neighborhood name when no city name is available', () => {
    const url = getGoogleMapsUrl(makeNeighborhood({ name: 'Old Town' }), undefined);
    expect(url).toBe(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('Old Town')}`);
  });

  it('does not double-encode coordinates that could contain special characters', () => {
    // Negative coordinates should render as plain numbers, not URI-encoded.
    const url = getGoogleMapsUrl(makeNeighborhood({ lat: -33.87, lng: 151.21 }), 'Sydney');
    expect(url).toContain('query=-33.87,151.21');
  });
});
