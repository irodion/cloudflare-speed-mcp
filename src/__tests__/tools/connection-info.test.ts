/**
 * Tests for ConnectionInfoTool
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

import { ConnectionInfoTool } from '../../tools/connection-info.js';
import { RateLimiter } from '../../services/rate-limiter.js';
import { CloudflareSpeedTestClient } from '../../clients/cloudflare.js';

// Mock dependencies
jest.mock('../../services/rate-limiter.js');
jest.mock('../../clients/cloudflare.js');

describe('ConnectionInfoTool', () => {
  let tool: ConnectionInfoTool;
  let mockRateLimiter: jest.Mocked<RateLimiter>;
  let mockCloudflareClient: jest.Mocked<CloudflareSpeedTestClient>;

  beforeEach(() => {
    mockRateLimiter = new RateLimiter() as jest.Mocked<RateLimiter>;
    mockCloudflareClient =
      new CloudflareSpeedTestClient() as jest.Mocked<CloudflareSpeedTestClient>;
    tool = new ConnectionInfoTool(mockRateLimiter, mockCloudflareClient);

    mockRateLimiter.checkRateLimit = jest.fn();
    mockCloudflareClient.getConnectionInfo = jest.fn();
  });

  describe('Tool Metadata', () => {
    test('should return correct tool name', () => {
      expect(tool.getToolName()).toBe('get_connection_info');
    });

    test('should return description', () => {
      expect(tool.getDescription()).toContain('connection');
    });

    test('should return valid input schema', () => {
      const schema = tool.getInputSchema();
      expect(schema).toHaveProperty('type', 'object');
      expect(schema).toHaveProperty('additionalProperties', false);
      expect(schema.properties).toHaveProperty('includeLocation');
      expect(schema.properties).toHaveProperty('includeISP');
    });
  });

  describe('Input Validation', () => {
    test('should accept valid arguments', () => {
      expect(() => {
        (tool as any).validateArguments({
          includeLocation: true,
          includeISP: false,
        });
      }).not.toThrow();
    });

    test('should accept empty arguments', () => {
      expect(() => {
        (tool as any).validateArguments({});
      }).not.toThrow();
    });

    test('should reject non-boolean includeLocation', () => {
      expect(() => {
        (tool as any).validateArguments({ includeLocation: 'yes' });
      }).toThrow('includeLocation must be a boolean');
    });

    test('should reject non-boolean includeISP', () => {
      expect(() => {
        (tool as any).validateArguments({ includeISP: 1 });
      }).toThrow('includeISP must be a boolean');
    });
  });

  describe('Tool Execution', () => {
    const mockConnectionInfo = {
      ip: '203.0.113.1',
      isp: null,
      country: 'US',
      region: null,
      city: null,
      timezone: null,
      raw: {
        ip: '203.0.113.1',
        loc: 'US',
        fl: 'abc123',
        h: 'speed.cloudflare.com',
        ts: '1234567890',
        visit_scheme: 'https',
        uag: 'node-fetch',
        colo: 'SJC',
        sliver: 'none',
        http: 'http/2',
        tls: 'TLSv1.3',
        sni: 'plaintext',
        warp: 'off',
        gateway: 'off',
        rbi: 'off',
        kex: 'X25519',
      },
    };

    test('should retrieve connection info with defaults', async () => {
      mockCloudflareClient.getConnectionInfo.mockResolvedValue(
        mockConnectionInfo
      );

      const response = await tool.execute({
        name: 'get_connection_info',
        arguments: {},
      });

      expect(response.isError).toBeFalsy();

      const result = JSON.parse(response.content[0].text);
      expect(result.success).toBe(true);
      expect(result.data.ip).toBe('203.0.113.1');
      expect(result.data.location).toBeDefined();
      expect(result.data.location.country).toBe('US');
      expect(result.data.connection).toBeDefined();
      expect(result.data.raw).toBeDefined();
    });

    test('should exclude location when includeLocation is false', async () => {
      mockCloudflareClient.getConnectionInfo.mockResolvedValue(
        mockConnectionInfo
      );

      const response = await tool.execute({
        name: 'get_connection_info',
        arguments: { includeLocation: false },
      });

      const result = JSON.parse(response.content[0].text);
      expect(result.success).toBe(true);
      expect(result.data.location).toBeUndefined();
      expect(result.data.ip).toBe('203.0.113.1');
    });

    test('should exclude ISP when includeISP is false', async () => {
      mockCloudflareClient.getConnectionInfo.mockResolvedValue(
        mockConnectionInfo
      );

      const response = await tool.execute({
        name: 'get_connection_info',
        arguments: { includeISP: false },
      });

      const result = JSON.parse(response.content[0].text);
      expect(result.success).toBe(true);
      expect(result.data.isp).toBeNull();
    });

    test('should return null for unavailable fields', async () => {
      mockCloudflareClient.getConnectionInfo.mockResolvedValue({
        ip: '10.0.0.1',
        isp: null,
        country: 'unknown',
        region: null,
        city: null,
        timezone: null,
        raw: { ip: '10.0.0.1' },
      });

      const response = await tool.execute({
        name: 'get_connection_info',
        arguments: {},
      });

      const result = JSON.parse(response.content[0].text);
      expect(result.success).toBe(true);
      expect(result.data.isp).toBeNull();
      expect(result.data.location.region).toBeNull();
      expect(result.data.location.city).toBeNull();
      expect(result.data.location.timezone).toBeNull();
    });

    test('should handle rate limiting', async () => {
      mockRateLimiter.checkRateLimit.mockImplementation(() => {
        throw new Error('Rate limit exceeded');
      });

      const response = await tool.execute({
        name: 'get_connection_info',
        arguments: {},
      });

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('Rate limit exceeded');
    });

    test('should handle network errors', async () => {
      mockCloudflareClient.getConnectionInfo.mockRejectedValue(
        new Error('Failed to fetch trace API')
      );

      const response = await tool.execute({
        name: 'get_connection_info',
        arguments: {},
      });

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('Failed to fetch trace API');
    });

    test('should not leak stack traces on error', async () => {
      mockCloudflareClient.getConnectionInfo.mockRejectedValue(
        new Error('Connection error')
      );

      const response = await tool.execute({
        name: 'get_connection_info',
        arguments: {},
      });

      const result = JSON.parse(response.content[0].text);
      expect(JSON.stringify(result)).not.toContain('at ');
    });

    test('should include raw trace data', async () => {
      mockCloudflareClient.getConnectionInfo.mockResolvedValue(
        mockConnectionInfo
      );

      const response = await tool.execute({
        name: 'get_connection_info',
        arguments: {},
      });

      const result = JSON.parse(response.content[0].text);
      expect(result.data.raw).toBeDefined();
      expect(result.data.raw.colo).toBe('SJC');
      expect(result.data.raw.tls).toBe('TLSv1.3');
    });
  });
});
