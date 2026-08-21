import type { Neighborhood } from '@models/api.model';

/**
 * Build the "Open in Google Maps" URL for a neighborhood card / map pin.
 *
 * Ported from the retired React dashboard's
 * `src/components/neighborhoods/NeighborhoodMap.tsx#getGoogleMapsUrl`
 * (A4 parity port #1). Priority order, matching the original:
 *   1. An explicit `mapUrl` on the neighborhood record, if present.
 *   2. A coordinate-based Maps search when `lat`/`lng` are both present.
 *   3. A text search built from the neighborhood name + city name.
 *
 * Unlike the React original's `string | null` return type, this always
 * returns a usable URL — every branch in the original produced a string
 * too, so the `| null` was vestigial.
 */
export function getGoogleMapsUrl(nh: Neighborhood, cityName: string | undefined): string {
  if (nh.mapUrl) return nh.mapUrl;

  if (nh.lat !== undefined && nh.lng !== undefined) {
    return `https://www.google.com/maps/search/?api=1&query=${nh.lat},${nh.lng}`;
  }

  const query = cityName ? `${nh.name}, ${cityName}` : nh.name;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
