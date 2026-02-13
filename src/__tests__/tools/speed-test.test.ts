/**
 * Tests for SpeedTestTool (comprehensive speed test)
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

import { SpeedTestTool } from '../../tools/speed-test.js';
import { RateLimiter } from '../../services/rate-limiter.js';
import { CloudflareSpeedTestClient } from '../../clients/cloudflare.js';
import type { Results as CloudflareResults } from '@cloudflare/speedtest';

// Mock dependencies
jest.mock('../../services/rate-limiter.js');
jest.mock('../../clients/cloudflare.js');

describe('SpeedTestTool', () => {
  let tool: SpeedTestTool;
  let mockRateLimiter: jest.Mocked<RateLimiter>;
  let mockCloudflareClient: jest.Mocked<CloudflareSpeedTestClient>;

  beforeEach(() => {
    mockRateLimiter = new RateLimiter() as jest.Mocked<RateLimiter>;
    mockCloudflareClient =
      new CloudflareSpeedTestClient() as jest.Mocked<CloudflareSpeedTestClient>;
    tool = new SpeedTestTool(mockRateLimiter, mockCloudflareClient);

    mockRateLimiter.checkRateLimit = jest.fn();
    mockCloudflareClient.runSpeedTest = jest.fn();
  });

  describe('Tool Metadata', () => {
    test('should return correct tool name', () => {
      expect(tool.getToolName()).toBe('run_speed_test');
    });

    test('should return description containing speed test', () => {
      expect(tool.getDescription().toLowerCase()).toContain('speed test');
    });

    test('should return valid input schema with all options', () => {
      const schema = tool.getInputSchema();
      expect(schema).toHaveProperty('type', 'object');
      expect(schema).toHaveProperty('additionalProperties', false);
      expect(schema.properties).toHaveProperty('testTypes');
      expect(schema.properties).toHaveProperty('comprehensiveMode');
      expect(schema.properties).toHaveProperty('latencyOptions');
      expect(schema.properties).toHaveProperty('bandwidthOptions');
      expect(schema.properties).toHaveProperty('packetLossOptions');
    });
  });

  describe('Input Validation', () => {
    test('should accept valid arguments', () => {
      expect(() => {
        (tool as any).validateArguments({
          testTypes: ['latency', 'download'],
          comprehensiveMode: true,
        });
      }).not.toThrow();
    });

    test('should accept empty arguments', () => {
      expect(() => {
        (tool as any).validateArguments({});
      }).not.toThrow();
    });

    test('should reject empty testTypes array', () => {
      expect(() => {
        (tool as any).validateArguments({ testTypes: [] });
      }).toThrow('Test types must be a non-empty array');
    });

    test('should reject invalid test type', () => {
      expect(() => {
        (tool as any).validateArguments({ testTypes: ['latency', 'invalid'] });
      }).toThrow('Invalid test types: invalid');
    });

    test('should reject non-boolean comprehensiveMode', () => {
      expect(() => {
        (tool as any).validateArguments({ comprehensiveMode: 'yes' });
      }).toThrow('Comprehensive mode must be a boolean');
    });

    test('should reject non-object nested options', () => {
      expect(() => {
        (tool as any).validateArguments({ latencyOptions: 'invalid' });
      }).toThrow('latencyOptions must be an object');
    });

    test('should reject array nested options', () => {
      expect(() => {
        (tool as any).validateArguments({ bandwidthOptions: [1, 2] });
      }).toThrow('bandwidthOptions must be an object');
    });

    test('should reject null nested options', () => {
      expect(() => {
        (tool as any).validateArguments({ packetLossOptions: null });
      }).toThrow('packetLossOptions must be an object');
    });
  });

  describe('Tool Execution', () => {
    function createMockResults(
      overrides: {
        downloadBandwidth?: number | undefined;
        uploadBandwidth?: number | undefined;
        unloadedLatency?: number | undefined;
        jitter?: number | undefined;
        packetLoss?: number | undefined;
      } = {}
    ): Partial<CloudflareResults> {
      const has = (key: string) =>
        Object.prototype.hasOwnProperty.call(overrides, key);
      return {
        getDownloadBandwidth: jest
          .fn()
          .mockReturnValue(
            has('downloadBandwidth')
              ? overrides.downloadBandwidth
              : 100000000
          ),
        getUploadBandwidth: jest
          .fn()
          .mockReturnValue(
            has('uploadBandwidth') ? overrides.uploadBandwidth : 50000000
          ),
        getUnloadedLatency: jest
          .fn()
          .mockReturnValue(
            has('unloadedLatency') ? overrides.unloadedLatency : 15
          ),
        getPacketLoss: jest
          .fn()
          .mockReturnValue(
            has('packetLoss') ? overrides.packetLoss : 0.1
          ),
        getSummary: jest.fn().mockReturnValue({
          jitter: has('jitter') ? overrides.jitter : 2.5,
        }),
      };
    }

    test('should execute comprehensive speed test with all types', async () => {
      mockCloudflareClient.runSpeedTest.mockResolvedValue(
        createMockResults() as CloudflareResults
      );

      const response = await tool.execute({
        name: 'run_speed_test',
        arguments: {},
      });

      expect(response.isError).toBeFalsy();

      const result = JSON.parse(response.content[0].text);
      expect(result.success).toBe(true);
      expect(result.data.latency).toEqual({ latency: 15, jitter: 2.5 });
      expect(result.data.download.bandwidth).toBe(100000000);
      expect(result.data.download.throughput).toBe(100000000 / 8);
      expect(result.data.upload.bandwidth).toBe(50000000);
      expect(result.data.upload.throughput).toBe(50000000 / 8);
      expect(result.data.packetLoss.packetLoss).toBe(0.1);
      expect(result.data.summary).toBeDefined();
      expect(result.data.summary.overallScore).toBeGreaterThan(0);
      expect(result.data.summary.classification).toBeDefined();
    });

    test('should run only selected test types', async () => {
      mockCloudflareClient.runSpeedTest.mockResolvedValue(
        createMockResults() as CloudflareResults
      );

      const response = await tool.execute({
        name: 'run_speed_test',
        arguments: { testTypes: ['latency', 'download'] },
      });

      const result = JSON.parse(response.content[0].text);
      expect(result.success).toBe(true);
      expect(result.data.latency).toBeDefined();
      expect(result.data.download).toBeDefined();
      expect(result.data.upload).toBeUndefined();
      expect(result.data.packetLoss).toBeUndefined();
    });

    test('should pass full type to cloudflare client', async () => {
      mockCloudflareClient.runSpeedTest.mockResolvedValue(
        createMockResults() as CloudflareResults
      );

      await tool.execute({
        name: 'run_speed_test',
        arguments: { timeout: 120 },
      });

      expect(mockCloudflareClient.runSpeedTest).toHaveBeenCalledWith({
        type: 'full',
        timeout: 120,
      });
    });

    test('should handle missing download bandwidth', async () => {
      mockCloudflareClient.runSpeedTest.mockResolvedValue(
        createMockResults({
          downloadBandwidth: undefined,
        }) as CloudflareResults
      );

      const response = await tool.execute({
        name: 'run_speed_test',
        arguments: { testTypes: ['download'] },
      });

      const result = JSON.parse(response.content[0].text);
      expect(result.success).toBe(true);
      expect(result.data.download).toBeUndefined();
    });

    test('should handle missing upload bandwidth', async () => {
      mockCloudflareClient.runSpeedTest.mockResolvedValue(
        createMockResults({
          uploadBandwidth: undefined,
        }) as CloudflareResults
      );

      const response = await tool.execute({
        name: 'run_speed_test',
        arguments: { testTypes: ['upload'] },
      });

      const result = JSON.parse(response.content[0].text);
      expect(result.success).toBe(true);
      expect(result.data.upload).toBeUndefined();
    });

    test('should handle missing packet loss', async () => {
      mockCloudflareClient.runSpeedTest.mockResolvedValue(
        createMockResults({
          packetLoss: undefined,
        }) as CloudflareResults
      );

      const response = await tool.execute({
        name: 'run_speed_test',
        arguments: { testTypes: ['packetLoss'] },
      });

      const result = JSON.parse(response.content[0].text);
      expect(result.success).toBe(true);
      expect(result.data.packetLoss).toBeUndefined();
    });

    test('should classify excellent connection', async () => {
      mockCloudflareClient.runSpeedTest.mockResolvedValue(
        createMockResults({
          downloadBandwidth: 500000000,
          uploadBandwidth: 100000000,
          unloadedLatency: 5,
          packetLoss: 0,
          jitter: 1,
        }) as CloudflareResults
      );

      const response = await tool.execute({
        name: 'run_speed_test',
        arguments: {},
      });

      const result = JSON.parse(response.content[0].text);
      expect(result.data.summary.classification).toBe('excellent');
      expect(result.data.summary.overallScore).toBeGreaterThanOrEqual(80);
    });

    test('should classify poor connection', async () => {
      mockCloudflareClient.runSpeedTest.mockResolvedValue(
        createMockResults({
          downloadBandwidth: 1000000,
          uploadBandwidth: 500000,
          unloadedLatency: 500,
          packetLoss: 5,
          jitter: 50,
        }) as CloudflareResults
      );

      const response = await tool.execute({
        name: 'run_speed_test',
        arguments: {},
      });

      const result = JSON.parse(response.content[0].text);
      expect(result.data.summary.classification).toBe('poor');
      expect(result.data.summary.recommendations.length).toBeGreaterThan(0);
    });

    test('should provide recommendations for high latency', async () => {
      mockCloudflareClient.runSpeedTest.mockResolvedValue(
        createMockResults({
          unloadedLatency: 200,
        }) as CloudflareResults
      );

      const response = await tool.execute({
        name: 'run_speed_test',
        arguments: { testTypes: ['latency'] },
      });

      const result = JSON.parse(response.content[0].text);
      expect(result.data.summary.recommendations).toContainEqual(
        expect.stringContaining('latency')
      );
    });

    test('should handle rate limiting', async () => {
      mockRateLimiter.checkRateLimit.mockImplementation(() => {
        throw new Error('Rate limit exceeded');
      });

      const response = await tool.execute({
        name: 'run_speed_test',
        arguments: {},
      });

      expect(response.isError).toBe(true);
    });

    test('should handle client errors', async () => {
      mockCloudflareClient.runSpeedTest.mockRejectedValue(
        new Error('Connection failed')
      );

      const response = await tool.execute({
        name: 'run_speed_test',
        arguments: {},
      });

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('Connection failed');
    });
  });
});
