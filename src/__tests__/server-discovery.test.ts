import { ServerDiscoveryService } from '../services/server-discovery.js';
import { CloudflareSpeedTestClient } from '../clients/cloudflare.js';
import { RateLimiter } from '../services/rate-limiter.js';
import { ServerLocation } from '../types/speedtest.js';

// Mock the @cloudflare/speedtest module first
jest.mock('@cloudflare/speedtest', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('../clients/cloudflare.js');
jest.mock('../services/rate-limiter.js');
jest.mock('../utils/logger.js', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('ServerDiscoveryService', () => {
  let service: ServerDiscoveryService;
  let mockClient: jest.Mocked<CloudflareSpeedTestClient>;
  let mockRateLimiter: jest.Mocked<RateLimiter>;

  const mockServers: ServerLocation[] = [
    {
      name: 'LAX', // IATA code - unique identifier
      location: 'Los Angeles, CA',
      country: 'US',
      city: 'Los Angeles',
      region: 'CA',
      latitude: 33.9425,
      longitude: -118.408,
    },
    {
      name: 'SFO', // Different IATA code, different city
      location: 'San Francisco, CA',
      country: 'US',
      city: 'San Francisco',
      region: 'CA',
      latitude: 37.6213,
      longitude: -122.379,
    },
    {
      name: 'JFK', // Different IATA code, same city name in different state
      location: 'New York, NY',
      country: 'US',
      city: 'New York',
      region: 'NY',
      latitude: 40.6413,
      longitude: -73.7781,
    },
    {
      name: 'EWR', // Different IATA code, but could have same city name
      location: 'Newark, NJ',
      country: 'US',
      city: 'Newark',
      region: 'NJ',
      latitude: 40.6895,
      longitude: -74.1745,
    },
  ];

  beforeEach(() => {
    mockClient = new CloudflareSpeedTestClient() as jest.Mocked<CloudflareSpeedTestClient>;
    mockRateLimiter = new RateLimiter() as jest.Mocked<RateLimiter>;

    mockRateLimiter.checkRateLimit.mockReturnValue({
      allowed: true,
      remainingTokens: 99,
      dailyRequestsRemaining: 999,
    });

    mockClient.discoverServers.mockResolvedValue(mockServers);

    service = new ServerDiscoveryService(mockClient, mockRateLimiter);
  });

  describe('getServer', () => {
    it('should return a specific server by its unique name (IATA code)', async () => {
      const server = await service.getServer('LAX');
      expect(server).toBeTruthy();
      expect(server?.name).toBe('LAX');
      expect(server?.city).toBe('Los Angeles');
    });

    it('should return null for non-existent server name', async () => {
      const server = await service.getServer('INVALID');
      expect(server).toBeNull();
    });

    it('should distinguish between servers with similar location attributes', async () => {
      const jfk = await service.getServer('JFK');
      const ewr = await service.getServer('EWR');

      expect(jfk).toBeTruthy();
      expect(ewr).toBeTruthy();
      expect(jfk?.name).toBe('JFK');
      expect(ewr?.name).toBe('EWR');
      expect(jfk?.city).toBe('New York');
      expect(ewr?.city).toBe('Newark');
    });
  });

  describe('getServersByLocation', () => {
    it('should return all servers matching location criteria', async () => {
      const servers = await service.getServersByLocation({
        country: 'US',
        region: 'CA',
      });

      expect(servers).toHaveLength(2);
      expect(servers.map(s => s.name).sort()).toEqual(['LAX', 'SFO']);
    });

    it('should return servers matching only specified criteria', async () => {
      const servers = await service.getServersByLocation({
        country: 'US',
      });

      expect(servers).toHaveLength(4);
      expect(servers.every(s => s.country === 'US')).toBe(true);
    });

    it('should return empty array when no servers match', async () => {
      const servers = await service.getServersByLocation({
        country: 'UK',
      });

      expect(servers).toHaveLength(0);
    });
  });

  describe('filtering with name filter', () => {
    it('should filter by unique server name', async () => {
      const servers = await service.getServers({ name: 'LAX' });
      
      expect(servers).toHaveLength(1);
      expect(servers[0].name).toBe('LAX');
    });

    it('should combine name filter with other filters', async () => {
      const servers = await service.getServers({
        name: 'LAX',
        country: 'US',
      });

      expect(servers).toHaveLength(1);
      expect(servers[0].name).toBe('LAX');
    });

    it('should return empty when name filter does not match', async () => {
      const servers = await service.getServers({
        name: 'LAX',
        country: 'UK', // LAX is in US, not UK
      });

      expect(servers).toHaveLength(0);
    });
  });

  describe('unique server identification', () => {
    it('should handle multiple servers in same city/country with unique names', async () => {
      // Add servers with same city/country but different IATA codes
      const duplicateCityServers: ServerLocation[] = [
        {
          name: 'LAX',
          location: 'Los Angeles, CA',
          country: 'US',
          city: 'Los Angeles',
          region: 'CA',
        },
        {
          name: 'BUR', // Burbank airport, also serves LA area
          location: 'Los Angeles, CA',
          country: 'US',
          city: 'Los Angeles',
          region: 'CA',
        },
      ];

      mockClient.discoverServers.mockResolvedValue(duplicateCityServers);
      service.clearCache(); // Clear cache to force fresh fetch

      const servers = await service.getServersByLocation({
        city: 'Los Angeles',
        country: 'US',
      });

      expect(servers).toHaveLength(2);
      expect(servers.map(s => s.name).sort()).toEqual(['BUR', 'LAX']);

      // Each can be uniquely retrieved by name
      const lax = await service.getServer('LAX');
      const bur = await service.getServer('BUR');
      
      expect(lax?.name).toBe('LAX');
      expect(bur?.name).toBe('BUR');
      expect(lax).not.toBe(bur); // Different server objects
    });
  });
});