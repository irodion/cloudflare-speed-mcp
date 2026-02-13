/**
 * Tests for PacketLossTestTool
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

import { PacketLossTestTool } from '../../tools/packet-loss-test.js';
import { RateLimiter } from '../../services/rate-limiter.js';
import { CloudflareSpeedTestClient } from '../../clients/cloudflare.js';
import type { Results as CloudflareResults } from '@cloudflare/speedtest';

// Mock dependencies
jest.mock('../../services/rate-limiter.js');
jest.mock('../../clients/cloudflare.js');

describe('PacketLossTestTool', () => {
  let tool: PacketLossTestTool;
  let mockRateLimiter: jest.Mocked<RateLimiter>;
  let mockCloudflareClient: jest.Mocked<CloudflareSpeedTestClient>;

  beforeEach(() => {
    mockRateLimiter = new RateLimiter() as jest.Mocked<RateLimiter>;
    mockCloudflareClient =
      new CloudflareSpeedTestClient() as jest.Mocked<CloudflareSpeedTestClient>;
    tool = new PacketLossTestTool(mockRateLimiter, mockCloudflareClient);

    mockRateLimiter.checkRateLimit = jest.fn();
    mockCloudflareClient.runSpeedTest = jest.fn();
  });

  describe('Tool Metadata', () => {
    test('should return correct tool name', () => {
      expect(tool.getToolName()).toBe('test_packet_loss');
    });

    test('should return description containing packet loss', () => {
      expect(tool.getDescription().toLowerCase()).toContain('packet loss');
    });

    test('should return valid input schema', () => {
      const schema = tool.getInputSchema();
      expect(schema).toHaveProperty('type', 'object');
      expect(schema).toHaveProperty('additionalProperties', false);
      expect(schema.properties).toHaveProperty('packetCount');
      expect(schema.properties).toHaveProperty('batchSize');
      expect(schema.properties).toHaveProperty('batchWaitTime');
    });
  });

  describe('Input Validation', () => {
    test('should accept valid arguments', () => {
      expect(() => {
        (tool as any).validateArguments({
          packetCount: 50,
          batchSize: 10,
          batchWaitTime: 500,
        });
      }).not.toThrow();
    });

    test('should accept empty arguments', () => {
      expect(() => {
        (tool as any).validateArguments({});
      }).not.toThrow();
    });

    test('should reject packetCount below minimum', () => {
      expect(() => {
        (tool as any).validateArguments({ packetCount: 5 });
      }).toThrow('Packet count must be a number between 10 and 1000');
    });

    test('should reject packetCount above maximum', () => {
      expect(() => {
        (tool as any).validateArguments({ packetCount: 2000 });
      }).toThrow('Packet count must be a number between 10 and 1000');
    });

    test('should reject batchSize below minimum', () => {
      expect(() => {
        (tool as any).validateArguments({ batchSize: 0 });
      }).toThrow('Batch size must be a number between 1 and 50');
    });

    test('should reject batchSize above maximum', () => {
      expect(() => {
        (tool as any).validateArguments({ batchSize: 100 });
      }).toThrow('Batch size must be a number between 1 and 50');
    });

    test('should reject batchWaitTime below minimum', () => {
      expect(() => {
        (tool as any).validateArguments({ batchWaitTime: 50 });
      }).toThrow('Batch wait time must be between 100 and 5000 milliseconds');
    });

    test('should reject batchWaitTime above maximum', () => {
      expect(() => {
        (tool as any).validateArguments({ batchWaitTime: 10000 });
      }).toThrow('Batch wait time must be between 100 and 5000 milliseconds');
    });

    test('should reject batchSize exceeding packetCount', () => {
      expect(() => {
        (tool as any).validateArguments({ packetCount: 10, batchSize: 20 });
      }).toThrow('Batch size cannot exceed total packet count');
    });
  });

  describe('Tool Execution', () => {
    test('should execute packet loss test successfully', async () => {
      const mockResults: Partial<CloudflareResults> = {
        getPacketLoss: jest.fn().mockReturnValue(0.5),
      };

      mockCloudflareClient.runSpeedTest.mockResolvedValue(
        mockResults as CloudflareResults
      );

      const response = await tool.execute({
        name: 'test_packet_loss',
        arguments: {},
      });

      expect(response.isError).toBeFalsy();

      const result = JSON.parse(response.content[0].text);
      expect(result.success).toBe(true);
      expect(result.data.packetLoss).toBe(0.5);
    });

    test('should report zero packet loss', async () => {
      const mockResults: Partial<CloudflareResults> = {
        getPacketLoss: jest.fn().mockReturnValue(0),
      };

      mockCloudflareClient.runSpeedTest.mockResolvedValue(
        mockResults as CloudflareResults
      );

      const response = await tool.execute({
        name: 'test_packet_loss',
        arguments: {},
      });

      const result = JSON.parse(response.content[0].text);
      expect(result.success).toBe(true);
      expect(result.data.packetLoss).toBe(0);
    });

    test('should pass correct type to cloudflare client', async () => {
      const mockResults: Partial<CloudflareResults> = {
        getPacketLoss: jest.fn().mockReturnValue(0),
      };

      mockCloudflareClient.runSpeedTest.mockResolvedValue(
        mockResults as CloudflareResults
      );

      await tool.execute({
        name: 'test_packet_loss',
        arguments: { timeout: 90 },
      });

      expect(mockCloudflareClient.runSpeedTest).toHaveBeenCalledWith({
        type: 'packetLoss',
        timeout: 90,
      });
    });

    test('should handle undefined packet loss result', async () => {
      const mockResults: Partial<CloudflareResults> = {
        getPacketLoss: jest.fn().mockReturnValue(undefined),
      };

      mockCloudflareClient.runSpeedTest.mockResolvedValue(
        mockResults as CloudflareResults
      );

      const response = await tool.execute({
        name: 'test_packet_loss',
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
        name: 'test_packet_loss',
        arguments: {},
      });

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('Rate limit exceeded');
    });

    test('should handle network errors', async () => {
      mockCloudflareClient.runSpeedTest.mockRejectedValue(
        new Error('WebRTC connection failed')
      );

      const response = await tool.execute({
        name: 'test_packet_loss',
        arguments: {},
      });

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('WebRTC connection failed');
    });

    test('should not leak stack traces on error', async () => {
      mockCloudflareClient.runSpeedTest.mockRejectedValue(
        new Error('Internal error')
      );

      const response = await tool.execute({
        name: 'test_packet_loss',
        arguments: {},
      });

      const result = JSON.parse(response.content[0].text);
      expect(JSON.stringify(result)).not.toContain('at ');
    });
  });
});
