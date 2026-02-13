/**
 * Tests for DownloadTestTool
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

import { DownloadTestTool } from '../../tools/download-test.js';
import { RateLimiter } from '../../services/rate-limiter.js';
import { CloudflareSpeedTestClient } from '../../clients/cloudflare.js';
import type { Results as CloudflareResults } from '@cloudflare/speedtest';

// Mock dependencies
jest.mock('../../services/rate-limiter.js');
jest.mock('../../clients/cloudflare.js');

describe('DownloadTestTool', () => {
  let tool: DownloadTestTool;
  let mockRateLimiter: jest.Mocked<RateLimiter>;
  let mockCloudflareClient: jest.Mocked<CloudflareSpeedTestClient>;

  beforeEach(() => {
    mockRateLimiter = new RateLimiter() as jest.Mocked<RateLimiter>;
    mockCloudflareClient =
      new CloudflareSpeedTestClient() as jest.Mocked<CloudflareSpeedTestClient>;
    tool = new DownloadTestTool(mockRateLimiter, mockCloudflareClient);

    mockRateLimiter.checkRateLimit = jest.fn();
    mockCloudflareClient.runSpeedTest = jest.fn();
  });

  describe('Tool Metadata', () => {
    test('should return correct tool name', () => {
      expect(tool.getToolName()).toBe('test_download_speed');
    });

    test('should return description containing download', () => {
      expect(tool.getDescription()).toContain('download');
    });

    test('should return valid input schema', () => {
      const schema = tool.getInputSchema();
      expect(schema).toHaveProperty('type', 'object');
      expect(schema).toHaveProperty('additionalProperties', false);
      expect(schema.properties).toHaveProperty('timeout');
      expect(schema.properties).toHaveProperty('duration');
      expect(schema.properties).toHaveProperty('measurementBytes');
    });
  });

  describe('Input Validation', () => {
    test('should accept valid arguments', () => {
      expect(() => {
        (tool as any).validateArguments({
          timeout: 30,
          duration: 15,
          measurementBytes: 10485760,
        });
      }).not.toThrow();
    });

    test('should accept empty arguments', () => {
      expect(() => {
        (tool as any).validateArguments({});
      }).not.toThrow();
    });

    test('should reject invalid duration below minimum', () => {
      expect(() => {
        (tool as any).validateArguments({ duration: 2 });
      }).toThrow('Duration must be a number between 5 and 60 seconds');
    });

    test('should reject invalid duration above maximum', () => {
      expect(() => {
        (tool as any).validateArguments({ duration: 100 });
      }).toThrow('Duration must be a number between 5 and 60 seconds');
    });

    test('should reject non-number duration', () => {
      expect(() => {
        (tool as any).validateArguments({ duration: 'fast' });
      }).toThrow('Duration must be a number between 5 and 60 seconds');
    });

    test('should reject measurementBytes below minimum', () => {
      expect(() => {
        (tool as any).validateArguments({ measurementBytes: 100 });
      }).toThrow('Measurement bytes must be between 1KB and 1GB');
    });

    test('should reject measurementBytes above maximum', () => {
      expect(() => {
        (tool as any).validateArguments({ measurementBytes: 2000000000 });
      }).toThrow('Measurement bytes must be between 1KB and 1GB');
    });

    test('should reject invalid timeout', () => {
      expect(() => {
        (tool as any).validateArguments({ timeout: -5 });
      }).toThrow('Timeout must be a positive number');
    });
  });

  describe('Tool Execution', () => {
    test('should execute download test successfully', async () => {
      const mockResults: Partial<CloudflareResults> = {
        getDownloadBandwidth: jest.fn().mockReturnValue(50000000),
      };

      mockCloudflareClient.runSpeedTest.mockResolvedValue(
        mockResults as CloudflareResults
      );

      const response = await tool.execute({
        name: 'test_download_speed',
        arguments: {},
      });

      expect(response.isError).toBeFalsy();
      expect(response.content).toHaveLength(1);

      const result = JSON.parse(response.content[0].text);
      expect(result.success).toBe(true);
      expect(result.data.bandwidth).toBe(50000000);
      expect(result.data.throughput).toBe(50000000 / 8);
    });

    test('should pass correct type to cloudflare client', async () => {
      const mockResults: Partial<CloudflareResults> = {
        getDownloadBandwidth: jest.fn().mockReturnValue(50000000),
      };

      mockCloudflareClient.runSpeedTest.mockResolvedValue(
        mockResults as CloudflareResults
      );

      await tool.execute({
        name: 'test_download_speed',
        arguments: { timeout: 45 },
      });

      expect(mockCloudflareClient.runSpeedTest).toHaveBeenCalledWith({
        type: 'download',
        timeout: 45,
      });
    });

    test('should handle undefined bandwidth result', async () => {
      const mockResults: Partial<CloudflareResults> = {
        getDownloadBandwidth: jest.fn().mockReturnValue(undefined),
      };

      mockCloudflareClient.runSpeedTest.mockResolvedValue(
        mockResults as CloudflareResults
      );

      const response = await tool.execute({
        name: 'test_download_speed',
        arguments: {},
      });

      expect(response.isError).toBe(true);
      const result = JSON.parse(response.content[0].text);
      expect(result.error.message).toContain('no results returned');
    });

    test('should handle rate limiting', async () => {
      mockRateLimiter.checkRateLimit.mockImplementation(() => {
        throw new Error('Rate limit exceeded');
      });

      const response = await tool.execute({
        name: 'test_download_speed',
        arguments: {},
      });

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('Rate limit exceeded');
    });

    test('should handle network errors', async () => {
      mockCloudflareClient.runSpeedTest.mockRejectedValue(
        new Error('Network error')
      );

      const response = await tool.execute({
        name: 'test_download_speed',
        arguments: {},
      });

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('Network error');
    });

    test('should include execution time in result', async () => {
      const mockResults: Partial<CloudflareResults> = {
        getDownloadBandwidth: jest.fn().mockReturnValue(50000000),
      };

      mockCloudflareClient.runSpeedTest.mockResolvedValue(
        mockResults as CloudflareResults
      );

      const response = await tool.execute({
        name: 'test_download_speed',
        arguments: {},
      });

      const result = JSON.parse(response.content[0].text);
      expect(result.executionTime).toBeGreaterThanOrEqual(0);
      expect(result.timestamp).toBeDefined();
    });

    test('should not leak stack traces on error', async () => {
      mockCloudflareClient.runSpeedTest.mockRejectedValue(
        new Error('Something broke')
      );

      const response = await tool.execute({
        name: 'test_download_speed',
        arguments: {},
      });

      const result = JSON.parse(response.content[0].text);
      expect(result.error).not.toHaveProperty('stack');
      expect(JSON.stringify(result)).not.toContain('at ');
    });
  });
});
