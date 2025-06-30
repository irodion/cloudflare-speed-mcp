/**
 * Tests for LatencyTestTool
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

import { LatencyTestTool } from '../../tools/latency-test.js';
import { RateLimiter } from '../../services/rate-limiter.js';
import { CloudflareSpeedTestClient } from '../../clients/cloudflare.js';
import type { Results as CloudflareResults } from '@cloudflare/speedtest';

// Mock dependencies
jest.mock('../../services/rate-limiter.js');
jest.mock('../../clients/cloudflare.js');

describe('LatencyTestTool', () => {
  let tool: LatencyTestTool;
  let mockRateLimiter: jest.Mocked<RateLimiter>;
  let mockCloudflareClient: jest.Mocked<CloudflareSpeedTestClient>;

  beforeEach(() => {
    mockRateLimiter = new RateLimiter() as jest.Mocked<RateLimiter>;
    mockCloudflareClient = new CloudflareSpeedTestClient() as jest.Mocked<CloudflareSpeedTestClient>;
    tool = new LatencyTestTool(mockRateLimiter, mockCloudflareClient);

    // Setup default mocks
    mockRateLimiter.checkRateLimit = jest.fn();
    mockCloudflareClient.runSpeedTest = jest.fn();
  });

  describe('Tool Metadata', () => {
    test('should return correct tool name', () => {
      expect(tool.getToolName()).toBe('test_latency');
    });

    test('should return description', () => {
      const description = tool.getDescription();
      expect(description).toContain('latency');
      expect(description).toContain('ping');
    });

    test('should return valid input schema', () => {
      const schema = tool.getInputSchema();
      expect(schema).toHaveProperty('type', 'object');
      expect(schema).toHaveProperty('properties');
      expect(schema.properties).toHaveProperty('timeout');
      expect(schema.properties).toHaveProperty('packetCount');
    });
  });

  describe('Input Validation', () => {
    test('should accept valid arguments', () => {
      const validArgs = {
        timeout: 30,
        packetCount: 10,
        measurementType: 'unloaded'
      };

      expect(() => {
        (tool as any).validateArguments(validArgs);
      }).not.toThrow();
    });

    test('should reject invalid timeout', () => {
      const invalidArgs = { timeout: -5 };

      expect(() => {
        (tool as any).validateArguments(invalidArgs);
      }).toThrow('Timeout must be a positive number');
    });

    test('should reject invalid packet count', () => {
      const invalidArgs = { packetCount: 150 };

      expect(() => {
        (tool as any).validateArguments(invalidArgs);
      }).toThrow('Packet count must be a number between 1 and 100');
    });

    test('should reject invalid measurement type', () => {
      const invalidArgs = { measurementType: 'invalid' };

      expect(() => {
        (tool as any).validateArguments(invalidArgs);
      }).toThrow('Measurement type must be either "unloaded" or "loaded"');
    });
  });

  describe('Tool Execution', () => {
    test('should execute latency test successfully', async () => {
      const mockResults: Partial<CloudflareResults> = {
        getUnloadedLatency: jest.fn().mockReturnValue(25.5),
        getSummary: jest.fn().mockReturnValue({ jitter: 2.1 })
      };

      mockCloudflareClient.runSpeedTest.mockResolvedValue(mockResults as CloudflareResults);

      const response = await tool.execute({
        name: 'test_latency',
        arguments: { packetCount: 15 }
      });

      expect(response.isError).toBeFalsy();
      expect(response.content).toHaveLength(1);
      
      const result = JSON.parse(response.content[0].text);
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('latency', 25.5);
      expect(result.data).toHaveProperty('jitter', 2.1);
      expect(result.data).toHaveProperty('packetsSent', 15);
    });

    test('should handle rate limiting', async () => {
      mockRateLimiter.checkRateLimit.mockImplementation(() => {
        throw new Error('Rate limit exceeded');
      });

      const response = await tool.execute({
        name: 'test_latency',
        arguments: {}
      });

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('Rate limit exceeded');
    });

    test('should handle cloudflare client errors', async () => {
      mockCloudflareClient.runSpeedTest.mockRejectedValue(new Error('Network error'));

      const response = await tool.execute({
        name: 'test_latency',
        arguments: {}
      });

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('Network error');
    });

    test('should handle missing latency results', async () => {
      const mockResults: Partial<CloudflareResults> = {
        getUnloadedLatency: jest.fn().mockReturnValue(undefined),
        getSummary: jest.fn().mockReturnValue({})
      };

      mockCloudflareClient.runSpeedTest.mockResolvedValue(mockResults as CloudflareResults);

      const response = await tool.execute({
        name: 'test_latency',
        arguments: {}
      });

      expect(response.isError).toBeFalsy();
      const result = JSON.parse(response.content[0].text);
      expect(result.data.latency).toBe(0);
    });
  });
});