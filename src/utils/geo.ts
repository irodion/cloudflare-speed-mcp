/**
 * Geographic utility functions for server distance calculations
 */

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface Location {
  latitude?: number;
  longitude?: number;
  continent?: string;
  country?: string;
  region?: string;
  city?: string;
}

/**
 * Calculate distance between two points using Haversine formula
 * @param from - Starting coordinates
 * @param to - Destination coordinates
 * @returns Distance in kilometers
 */
export function calculateDistance(from: Coordinates, to: Coordinates): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = toRadians(to.latitude - from.latitude);
  const dLon = toRadians(to.longitude - from.longitude);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(from.latitude)) *
      Math.cos(toRadians(to.latitude)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Convert degrees to radians
 */
function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Validate coordinate values
 */
export function isValidCoordinate(coord: Coordinates): boolean {
  return (
    coord.latitude >= -90 &&
    coord.latitude <= 90 &&
    coord.longitude >= -180 &&
    coord.longitude <= 180
  );
}

/**
 * Format distance for display
 */
export function formatDistance(distanceKm: number): string {
  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)} m`;
  }
  return `${distanceKm.toFixed(1)} km`;
}

/**
 * Map of continents to their common country codes
 */
export const CONTINENT_MAP: Record<string, string[]> = {
  'north-america': ['US', 'CA', 'MX'],
  'south-america': ['BR', 'AR', 'CL', 'CO', 'PE'],
  europe: ['GB', 'DE', 'FR', 'IT', 'ES', 'NL', 'PL', 'SE', 'CH'],
  asia: ['CN', 'JP', 'IN', 'KR', 'SG', 'HK', 'TW', 'TH', 'MY'],
  africa: ['ZA', 'EG', 'NG', 'KE', 'MA'],
  oceania: ['AU', 'NZ'],
};

/**
 * Get continent from country code
 */
export function getContinentFromCountry(
  countryCode: string
): string | undefined {
  const upperCode = countryCode.toUpperCase();
  for (const [continent, countries] of Object.entries(CONTINENT_MAP)) {
    if (countries.includes(upperCode)) {
      return continent;
    }
  }
  return undefined;
}

/**
 * Filter locations by region criteria
 */
export function filterByRegion(
  locations: Location[],
  filter: {
    continent?: string;
    country?: string;
    region?: string;
  }
): Location[] {
  return locations.filter((location) => {
    if (filter.continent && location.continent !== filter.continent) {
      return false;
    }
    if (filter.country && location.country !== filter.country) {
      return false;
    }
    if (filter.region && location.region !== filter.region) {
      return false;
    }
    return true;
  });
}
