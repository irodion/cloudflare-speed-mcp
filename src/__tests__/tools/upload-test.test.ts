/**
 * Tests for UploadTestTool
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

import { UploadTestTool } from '../../tools/upload-test.js';
import { RateLimiter } from '../../services/rate-limiter.js';
import { CloudflareSpeedTestClient } from '../../clients/cloudflare.js';
import type { Results as CloudflareResults } from '@cloudflare/speedtest';

// Mock dependencies
jest.mock('../../services/rate-limiter.js');
jest.mock('../../clients/cloudflare.js');

describe('UploadTestTool', () => {
  let tool: UploadTestTool;
  let mockRateLimiter: jest.Mocked<RateLimiter>;
  let mockCloudflareClient: jest.Mocked<CloudflareSpeedTestClient>;

  beforeEach(() => {
    mockRateLimiter = new RateLimiter() as jest.Mocked<RateLimiter>;
    mockCloudflareClient =
      new CloudflareSpeedTestClient() as jest.Mocked<CloudflareSpeedTestClient>;
    tool = new UploadTestTool(mockRateLimiter, mockCloudflareClient);

    mockRateLimiter.checkRateLimit = jest.fn();
    mockCloudflareClient.runSpeedTest = jest.fn();
  });

  describe('Tool Metadata', () => {
    test('should return correct tool name', () => {
      expect(tool.getToolName()).toBe('test_upload_speed');
    });

    test('should return description containing upload', () => {
      expect(tool.getDescription()).toContain('upload');
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

    test('should reject invalid duration', () => {
      expect(() => {
        (tool as any).validateArguments({ duration: 2 });
      }).toThrow('Duration must be a number between 5 and 60 seconds');
    });

    test('should reject invalid measurementBytes', () => {
      expect(() => {
        (tool as any).validateArguments({ measurementBytes: 100 });
      }).toThrow('Measurement bytes must be between 1KB and 1GB');
    });
  });

  describe('Tool Execution', () => {
    test('should execute upload test successfully', async () => {
      const mockResults: Partial<CloudflareResults> = {
        getUploadBandwidth: jest.fn().mockReturnValue(25000000),
      };

      mockCloudflareClient.runSpeedTest.mockResolvedValue(
        mockResults as CloudflareResults
      );

      const response = await tool.execute({
        name: 'test_upload_speed',
        arguments: {},
      });

      expect(response.isError).toBeFalsy();

      const result = JSON.parse(response.content[0].text);
      expect(result.success).toBe(true);
      expect(result.data.bandwidth).toBe(25000000);
      expect(result.data.throughput).toBe(25000000 / 8);
    });

    test('should pass correct type to cloudflare client', async () => {
      const mockResults: Partial<CloudflareResults> = {
        getUploadBandwidth: jest.fn().mockReturnValue(25000000),
      };

      mockCloudflareClient.runSpeedTest.mockResolvedValue(
        mockResults as CloudflareResults
      );

      await tool.execute({
        name: 'test_upload_speed',
        arguments: { timeout: 60 },
      });

      expect(mockCloudflareClient.runSpeedTest).toHaveBeenCalledWith({
        type: 'upload',
        timeout: 60,
      });
    });

    test('should handle undefined bandwidth result', async () => {
      const mockResults: Partial<CloudflareResults> = {
        getUploadBandwidth: jest.fn().mockReturnValue(undefined),
      };

      mockCloudflareClient.runSpeedTest.mockResolvedValue(
        mockResults as CloudflareResults
      );

      const response = await tool.execute({
        name: 'test_upload_speed',
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
        name: 'test_upload_speed',
        arguments: {},
      });

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('Rate limit exceeded');
    });

    test('should handle network errors', async () => {
      mockCloudflareClient.runSpeedTest.mockRejectedValue(
        new Error('Connection timeout')
      );

      const response = await tool.execute({
        name: 'test_upload_speed',
        arguments: {},
      });

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('Connection timeout');
    });

    test('should not leak stack traces on error', async () => {
      mockCloudflareClient.runSpeedTest.mockRejectedValue(
        new Error('Upload failed')
      );

      const response = await tool.execute({
        name: 'test_upload_speed',
        arguments: {},
      });

      const result = JSON.parse(response.content[0].text);
      expect(JSON.stringify(result)).not.toContain('at ');
    });
  });
});
