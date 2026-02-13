import { CloudflareSpeedTestClient } from '../clients/cloudflare.js';
import type { Results as CloudflareResults } from '@cloudflare/speedtest';

// Mock the @cloudflare/speedtest module
jest.mock('@cloudflare/speedtest', () => {
  return {
    __esModule: true,
    default: jest.fn(),
  };
});

// Mock fetch globally
global.fetch = jest.fn();

describe('CloudflareSpeedTestClient', () => {
  let client: CloudflareSpeedTestClient;
  let mockSpeedTest: {
    onFinish: jest.Mock;
    onError: jest.Mock;
    play: jest.Mock;
    pause: jest.Mock;
  };
  let mockFetch: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    mockFetch = jest.mocked(fetch);
    mockSpeedTest = {
      onFinish: jest.fn(),
      onError: jest.fn(),
      play: jest.fn(),
      pause: jest.fn(),
    };

    const SpeedTest = require('@cloudflare/speedtest').default;
    jest.mocked(SpeedTest).mockImplementation(() => mockSpeedTest);

    client = new CloudflareSpeedTestClient();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('runSpeedTest', () => {
    it('should successfully run a speed test', async () => {
      const mockResults: CloudflareResults = {
        getSummary: () => ({
          download: 100,
          upload: 50,
          latency: 15,
          jitter: 1,
          packetLoss: 0,
        }),
        getDownloadBandwidth: () => 100,
        getUploadBandwidth: () => 50,
        getUnloadedLatency: () => 15,
        getPacketLoss: () => 0,
      } as CloudflareResults;

      // Simulate successful speed test
      setTimeout(() => {
        mockSpeedTest.onFinish(mockResults);
      }, 10);

      const results = await client.runSpeedTest();

      expect(results).toBeDefined();
      expect(results.getDownloadBandwidth()).toBe(100);
      expect(results.getUploadBandwidth()).toBe(50);
      expect(results.getUnloadedLatency()).toBe(15);
    });

    it('should handle speed test errors', async () => {
      const testError = 'Network error';

      // Simulate speed test error
      setTimeout(() => {
        mockSpeedTest.onError(testError);
      }, 10);

      await expect(client.runSpeedTest()).rejects.toThrow(
        'Speed test execution failed'
      );
    });

    it('should handle timeout errors', async () => {
      // Don't call onFinish or onError - let it timeout
      const shortTimeoutClient = new CloudflareSpeedTestClient({
        timeouts: { DEFAULT: 100, SPEED_TEST: 100, CONNECTION_INFO: 100 },
      } as unknown as ConstructorParameters<
        typeof CloudflareSpeedTestClient
      >[0]);

      await expect(shortTimeoutClient.runSpeedTest()).rejects.toThrow(
        'timed out'
      );
    });

    it('should reject invalid timeout parameter', async () => {
      await expect(
        client.runSpeedTest({ timeout: -1 })
      ).rejects.toThrow('Timeout must be a positive number');
    });

    it('should filter measurements by test type', async () => {
      const mockResults: CloudflareResults = {
        getSummary: () => ({
          download: 0,
          upload: 0,
          latency: 15,
          jitter: 1,
          packetLoss: 0,
        }),
        getDownloadBandwidth: () => undefined,
        getUploadBandwidth: () => undefined,
        getUnloadedLatency: () => 15,
        getPacketLoss: () => 0,
      } as CloudflareResults;

      setTimeout(() => {
        mockSpeedTest.onFinish(mockResults);
      }, 10);

      await client.runSpeedTest({ type: 'latency' });

      const SpeedTest = require('@cloudflare/speedtest').default;
      const lastCall =
        jest.mocked(SpeedTest).mock.calls[
          jest.mocked(SpeedTest).mock.calls.length - 1
        ];
      const config = lastCall[0];

      expect(config.measurements).toHaveLength(1);
      expect(config.measurements[0].type).toBe('latency');
    });
  });

  describe('getConnectionInfo', () => {
    it('should successfully get connection info', async () => {
      const mockTrace =
        'ip=1.2.3.4\nloc=US\nfl=abc123\nh=speed.cloudflare.com\nts=1234567';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(mockTrace),
      } as Response);

      const connectionInfo = await client.getConnectionInfo();

      expect(connectionInfo.ip).toBe('1.2.3.4');
      expect(connectionInfo.country).toBe('US');
      expect(connectionInfo.isp).toBeNull();
      expect(connectionInfo.region).toBeNull();
      expect(connectionInfo.city).toBeNull();
      expect(connectionInfo.timezone).toBeNull();
      expect(connectionInfo.raw).toBeDefined();
      expect(connectionInfo.raw?.fl).toBe('abc123');
    });

    it('should handle connection info API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      } as Response);

      await expect(client.getConnectionInfo()).rejects.toThrow(
        'Connection info request failed'
      );
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(client.getConnectionInfo()).rejects.toThrow(
        'Failed to get connection info'
      );
    });

    it('should handle malformed trace response', async () => {
      const mockTrace = 'this is not key=value format\n\n';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(mockTrace),
      } as Response);

      const connectionInfo = await client.getConnectionInfo();

      // Should return defaults for missing fields
      expect(connectionInfo.ip).toBe('unknown');
      expect(connectionInfo.country).toBe('unknown');
    });

    it('should handle values containing equals signs', async () => {
      const mockTrace = 'ip=1.2.3.4\nloc=US\nsome_field=value=with=equals';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(mockTrace),
      } as Response);

      const connectionInfo = await client.getConnectionInfo();

      expect(connectionInfo.ip).toBe('1.2.3.4');
      expect(connectionInfo.raw?.some_field).toBe('value=with=equals');
    });
  });

  describe('discoverServers', () => {
    it('should successfully discover servers', async () => {
      const mockServers = [
        {
          iata: 'SFO',
          city: 'San Francisco',
          region: 'CA',
          country: 'US',
          lat: 37.7749,
          lon: -122.4194,
          distance: 0,
        },
        {
          iata: 'LAX',
          city: 'Los Angeles',
          region: 'CA',
          country: 'US',
          lat: 34.0522,
          lon: -118.2437,
          distance: 500,
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockServers),
      } as Response);

      const servers = await client.discoverServers();

      expect(servers).toHaveLength(2);
      expect(servers[0]).toEqual({
        name: 'SFO',
        location: 'San Francisco, CA',
        country: 'US',
        city: 'San Francisco',
        region: 'CA',
        latitude: 37.7749,
        longitude: -122.4194,
        distance: 0,
      });
    });

    it('should filter out malformed server entries', async () => {
      const mockServers = [
        { iata: 'SFO', city: 'San Francisco', region: 'CA', country: 'US' },
        null,
        { city: 'Missing IATA' }, // no iata field
        { iata: 'LAX', city: 'Los Angeles', region: 'CA', country: 'US' },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockServers),
      } as Response);

      const servers = await client.discoverServers();

      expect(servers).toHaveLength(2);
      expect(servers[0].name).toBe('SFO');
      expect(servers[1].name).toBe('LAX');
    });

    it('should handle non-array response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ error: 'not an array' }),
      } as Response);

      const servers = await client.discoverServers();
      expect(servers).toHaveLength(0);
    });

    it('should handle server discovery API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as Response);

      await expect(client.discoverServers()).rejects.toThrow(
        'Server discovery failed'
      );
    });
  });

  describe('healthCheck', () => {
    it('should return true for healthy service', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
      } as Response);

      const isHealthy = await client.healthCheck();
      expect(isHealthy).toBe(true);
    });

    it('should return false for unhealthy service', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
      } as Response);

      const isHealthy = await client.healthCheck();
      expect(isHealthy).toBe(false);
    });

    it('should return false on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const isHealthy = await client.healthCheck();
      expect(isHealthy).toBe(false);
    });
  });
});
