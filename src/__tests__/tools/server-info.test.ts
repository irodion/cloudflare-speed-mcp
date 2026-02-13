/**
 * Tests for ServerInfoTool
 */

// Mock the Cloudflare speedtest module
jest.mock('@cloudflare/speedtest', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    download: jest.fn().mockResolvedValue({ download: 100 }),
    upload: jest.fn().mockResolvedValue({ upload: 50 }),
    ping: jest.fn().mockResolvedValue({ latency: 15 }),
  })),
}));

import { ServerInfoTool } from '../../tools/server-info.js';
import { RateLimiter } from '../../services/rate-limiter.js';
import { CloudflareSpeedTestClient } from '../../clients/cloudflare.js';

// Mock dependencies
jest.mock('../../services/rate-limiter.js');
jest.mock('../../clients/cloudflare.js');
jest.mock('../../services/server-discovery.js');

import { ServerDiscoveryService } from '../../services/server-discovery.js';

describe('ServerInfoTool', () => {
  let tool: ServerInfoTool;
  let mockRateLimiter: jest.Mocked<RateLimiter>;
  let mockCloudflareClient: jest.Mocked<CloudflareSpeedTestClient>;
  let mockServerDiscovery: jest.Mocked<ServerDiscoveryService>;

  const sampleServers = [
    {
      name: 'SJC',
      location: 'San Jose, CA',
      city: 'San Jose',
      region: 'California',
      country: 'US',
      latitude: 37.3382,
      longitude: -121.8863,
      iata: 'SJC',
      status: 'available' as const,
      continent: 'North America',
      lastChecked: new Date(),
    },
    {
      name: 'LAX',
      location: 'Los Angeles, CA',
      city: 'Los Angeles',
      region: 'California',
      country: 'US',
      latitude: 33.9425,
      longitude: -118.4081,
      iata: 'LAX',
      status: 'available' as const,
      continent: 'North America',
      lastChecked: new Date(),
    },
    {
      name: 'LHR',
      location: 'London, UK',
      city: 'London',
      region: 'England',
      country: 'GB',
      latitude: 51.4700,
      longitude: -0.4543,
      iata: 'LHR',
      status: 'available' as const,
      continent: 'Europe',
      lastChecked: new Date(),
    },
  ];

  beforeEach(() => {
    mockRateLimiter = new RateLimiter() as jest.Mocked<RateLimiter>;
    mockCloudflareClient =
      new CloudflareSpeedTestClient() as jest.Mocked<CloudflareSpeedTestClient>;

    // Mock the ServerDiscoveryService prototype methods BEFORE creating the tool
    // so the tool's internal instance uses the mocked methods
    ServerDiscoveryService.prototype.getServers = jest
      .fn()
      .mockResolvedValue(sampleServers);
    ServerDiscoveryService.prototype.getServerStats = jest
      .fn()
      .mockResolvedValue({
        total: 3,
        byContinent: { 'North America': 2, Europe: 1 },
        byCountry: { US: 2, GB: 1 },
        cacheStatus: 'valid',
      });

    mockRateLimiter.checkRateLimit = jest.fn();
    mockCloudflareClient.getConnectionInfo = jest.fn();

    // Create the tool after mocks are set up
    tool = new ServerInfoTool(mockRateLimiter, mockCloudflareClient);

    mockServerDiscovery =
      new ServerDiscoveryService(
        mockCloudflareClient,
        mockRateLimiter
      ) as jest.Mocked<ServerDiscoveryService>;
  });

  describe('Tool Metadata', () => {
    test('should return correct tool name', () => {
      expect(tool.getToolName()).toBe('get_server_info');
    });

    test('should return description', () => {
      expect(tool.getDescription()).toContain('server');
    });

    test('should return valid input schema', () => {
      const schema = tool.getInputSchema();
      expect(schema).toHaveProperty('type', 'object');
      expect(schema).toHaveProperty('additionalProperties', false);
      expect(schema.properties).toHaveProperty('continent');
      expect(schema.properties).toHaveProperty('country');
      expect(schema.properties).toHaveProperty('region');
      expect(schema.properties).toHaveProperty('limit');
      expect(schema.properties).toHaveProperty('includeDistance');
    });
  });

  describe('Tool Execution', () => {
    test('should return server list', async () => {
      const response = await tool.execute({
        name: 'get_server_info',
        arguments: {},
      });

      expect(response.isError).toBeFalsy();
      expect(response.content).toHaveLength(1);

      // ServerInfoTool has custom formatResponse that returns text, not JSON
      const text = response.content[0].text;
      expect(text).toContain('SJC');
      expect(text).toContain('LAX');
      expect(text).toContain('LHR');
    });

    test('should include stats when no filter applied', async () => {
      const response = await tool.execute({
        name: 'get_server_info',
        arguments: {},
      });

      const text = response.content[0].text;
      expect(text).toContain('Server Distribution');
      expect(text).toContain('North America');
    });

    test('should apply limit to results', async () => {
      ServerDiscoveryService.prototype.getServers = jest
        .fn()
        .mockResolvedValue(sampleServers);

      const response = await tool.execute({
        name: 'get_server_info',
        arguments: { limit: 2 },
      });

      const text = response.content[0].text;
      expect(text).toContain('Found 2 servers');
    });

    test('should handle filtered results', async () => {
      const filteredServers = sampleServers.filter((s) => s.country === 'US');
      ServerDiscoveryService.prototype.getServers = jest
        .fn()
        .mockResolvedValue(filteredServers);

      const response = await tool.execute({
        name: 'get_server_info',
        arguments: { country: 'US' },
      });

      const text = response.content[0].text;
      expect(text).toContain('filtered');
    });

    test('should include user location when includeDistance is true', async () => {
      mockCloudflareClient.getConnectionInfo.mockResolvedValue({
        ip: '203.0.113.1',
        isp: null,
        country: 'US',
        region: 'California',
        city: 'San Francisco',
        timezone: null,
        raw: {},
      });

      const response = await tool.execute({
        name: 'get_server_info',
        arguments: { includeDistance: true },
      });

      const text = response.content[0].text;
      expect(text).toContain('Your location');
      expect(text).toContain('San Francisco');
    });

    test('should handle server discovery errors', async () => {
      // Access internal serverDiscovery and mock it to reject
      const internalDiscovery = (tool as any).serverDiscovery;
      internalDiscovery.getServers = jest
        .fn()
        .mockRejectedValue(new Error('Discovery failed'));

      const response = await tool.execute({
        name: 'get_server_info',
        arguments: {},
      });

      // executeImpl catches the error and returns {success: false},
      // base-tool then routes through formatErrorResponse which sets isError
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('Discovery failed');
    });

    test('should handle rate limiting', async () => {
      mockRateLimiter.checkRateLimit.mockImplementation(() => {
        throw new Error('Rate limit exceeded');
      });

      const response = await tool.execute({
        name: 'get_server_info',
        arguments: {},
      });

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('Rate limit exceeded');
    });

    test('should handle location fetch failure gracefully', async () => {
      mockCloudflareClient.getConnectionInfo.mockRejectedValue(
        new Error('Network error')
      );

      const response = await tool.execute({
        name: 'get_server_info',
        arguments: { includeDistance: true },
      });

      // Should still return servers even if location fails
      expect(response.isError).toBeFalsy();
      const text = response.content[0].text;
      expect(text).toContain('SJC');
    });
  });
});
