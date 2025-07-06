/**
 * Server discovery service for managing Cloudflare speed test servers
 */

import { CloudflareSpeedTestClient } from '../clients/cloudflare.js';
import { ServerLocation } from '../types/speedtest.js';
import { RateLimiter } from './rate-limiter.js';
import { OperationType } from '../types/rate-limit.js';
import {
  Location,
  calculateDistance,
  getContinentFromCountry,
} from '../utils/geo.js';
import { logger } from '../utils/logger.js';

export interface ServerInfo extends ServerLocation {
  status: 'available' | 'unavailable' | 'unknown';
  continent?: string;
  distanceKm?: number;
  lastChecked?: Date;
}

export interface ServerFilter {
  name?: string; // Unique server identifier (IATA code)
  continent?: string;
  country?: string;
  region?: string;
  maxDistance?: number;
}

interface CachedServerData {
  servers: ServerInfo[];
  timestamp: Date;
}

export class ServerDiscoveryService {
  private client: CloudflareSpeedTestClient;
  private rateLimiter: RateLimiter;
  private cache: CachedServerData | null = null;
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  private logger = logger;

  constructor(client: CloudflareSpeedTestClient, rateLimiter: RateLimiter) {
    this.client = client;
    this.rateLimiter = rateLimiter;
  }

  /**
   * Get available servers with optional filtering
   */
  async getServers(
    filter?: ServerFilter,
    userLocation?: Location
  ): Promise<ServerInfo[]> {
    // Check cache first
    if (this.isCacheValid()) {
      this.logger.debug('Using cached server data');
      return this.filterServers(this.cache!.servers, filter, userLocation);
    }

    // Apply rate limiting
    const rateLimitResult = this.rateLimiter.checkRateLimit(
      OperationType.CONNECTION_INFO
    );
    if (!rateLimitResult.allowed) {
      throw new Error(
        `Server discovery rate limit exceeded: ${rateLimitResult.reason}`
      );
    }

    try {
      // Fetch fresh server data
      const servers = await this.fetchServers();

      // Update cache
      this.cache = {
        servers,
        timestamp: new Date(),
      };

      this.logger.info(`Discovered ${servers.length} servers`);
      return this.filterServers(servers, filter, userLocation);
    } catch (error) {
      this.logger.error('Failed to discover servers', { error });

      // If we have stale cache, use it
      if (this.cache) {
        this.logger.warn('Using stale cache due to discovery failure');
        return this.filterServers(this.cache.servers, filter, userLocation);
      }

      throw error;
    }
  }

  /**
   * Get a specific server by name
   */
  async getServer(serverName: string): Promise<ServerInfo | null> {
    const servers = await this.getServers();
    return servers.find((s) => s.name === serverName) || null;
  }

  /**
   * Get servers matching specific location criteria
   * Returns all servers that match the criteria (may be multiple if they share location attributes)
   * Use getServer(name) with a specific IATA code for unique server identification
   */
  async getServersByLocation(
    location: Partial<Pick<ServerLocation, 'city' | 'country' | 'region'>>
  ): Promise<ServerInfo[]> {
    const servers = await this.getServers();
    return servers.filter((server) => {
      if (location.city && server.city !== location.city) {
        return false;
      }
      if (location.country && server.country !== location.country) {
        return false;
      }
      if (location.region && server.region !== location.region) {
        return false;
      }
      return true;
    });
  }

  /**
   * Clear the server cache
   */
  clearCache(): void {
    this.cache = null;
    this.logger.debug('Server cache cleared');
  }

  private isCacheValid(): boolean {
    if (!this.cache) return false;

    const now = new Date();
    const cacheAge = now.getTime() - this.cache.timestamp.getTime();
    return cacheAge < this.CACHE_TTL_MS;
  }

  private async fetchServers(): Promise<ServerInfo[]> {
    const serverLocations = await this.client.discoverServers();

    return serverLocations.map((location) => {
      const serverInfo: ServerInfo = {
        ...location,
        status: 'available', // Default to available
        continent: this.determineContinent(location),
        lastChecked: new Date(),
      };

      return serverInfo;
    });
  }

  private determineContinent(location: ServerLocation): string | undefined {
    // Try to determine continent from country code
    if (location.country) {
      return getContinentFromCountry(location.country);
    }

    // Could extend this with coordinate-based continent detection
    return undefined;
  }

  private filterServers(
    servers: ServerInfo[],
    filter?: ServerFilter,
    userLocation?: Location
  ): ServerInfo[] {
    let filtered = [...servers];

    // Calculate distances if user location is provided
    if (userLocation?.latitude && userLocation?.longitude) {
      const userLat = userLocation.latitude;
      const userLon = userLocation.longitude;
      filtered = filtered.map((server) => {
        if (server.latitude && server.longitude) {
          const distance = calculateDistance(
            {
              latitude: userLat,
              longitude: userLon,
            },
            { latitude: server.latitude, longitude: server.longitude }
          );
          return { ...server, distanceKm: distance };
        }
        return server;
      });
    }

    // Apply filters
    if (filter) {
      // Apply name filter for unique server identification
      if (filter.name) {
        filtered = filtered.filter((server) => server.name === filter.name);
      }

      // Apply regional filters
      if (filter.continent || filter.country || filter.region) {
        // Filter servers using name as unique identifier to prevent incorrect matches
        // when multiple servers share the same city/country combination
        filtered = filtered.filter((server) => {
          // Each server has a unique name (IATA code) that ensures accurate matching
          if (filter.continent && server.continent !== filter.continent) {
            return false;
          }
          if (filter.country && server.country !== filter.country) {
            return false;
          }
          if (filter.region && server.region !== filter.region) {
            return false;
          }
          return true;
        });
      }

      // Apply distance filter
      if (filter.maxDistance !== undefined && userLocation) {
        const maxDist = filter.maxDistance;
        filtered = filtered.filter(
          (server) =>
            server.distanceKm === undefined || server.distanceKm <= maxDist
        );
      }
    }

    // Sort by distance if available
    if (userLocation) {
      filtered.sort((a, b) => {
        if (a.distanceKm === undefined) return 1;
        if (b.distanceKm === undefined) return -1;
        return a.distanceKm - b.distanceKm;
      });
    }

    return filtered;
  }

  /**
   * Get server statistics
   */
  async getServerStats(): Promise<{
    total: number;
    byContinent: Record<string, number>;
    byCountry: Record<string, number>;
    cacheStatus: 'valid' | 'stale' | 'empty';
  }> {
    const servers = await this.getServers();

    const byContinent: Record<string, number> = {};
    const byCountry: Record<string, number> = {};

    servers.forEach((server) => {
      if (server.continent) {
        byContinent[server.continent] =
          (byContinent[server.continent] || 0) + 1;
      }
      byCountry[server.country] = (byCountry[server.country] || 0) + 1;
    });

    return {
      total: servers.length,
      byContinent,
      byCountry,
      cacheStatus: this.isCacheValid()
        ? 'valid'
        : this.cache
          ? 'stale'
          : 'empty',
    };
  }
}
