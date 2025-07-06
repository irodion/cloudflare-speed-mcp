/**
 * Tests for ToolRegistry
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

import { ToolRegistry } from '../../tools/index.js';
import { RateLimiter } from '../../services/rate-limiter.js';
import { CloudflareSpeedTestClient } from '../../clients/cloudflare.js';

// Mock dependencies
jest.mock('../../services/rate-limiter.js');
jest.mock('../../clients/cloudflare.js');

describe('ToolRegistry', () => {
  let registry: ToolRegistry;
  let mockRateLimiter: jest.Mocked<RateLimiter>;
  let mockCloudflareClient: jest.Mocked<CloudflareSpeedTestClient>;

  beforeEach(() => {
    mockRateLimiter = new RateLimiter() as jest.Mocked<RateLimiter>;
    mockCloudflareClient = new CloudflareSpeedTestClient() as jest.Mocked<CloudflareSpeedTestClient>;
    registry = new ToolRegistry(mockRateLimiter, mockCloudflareClient);
  });

  describe('Tool Registration', () => {
    test('should register all expected tools', () => {
      const tools = registry.getAllTools();
      expect(tools).toHaveLength(7);

      const toolNames = tools.map(tool => tool.getToolName());
      expect(toolNames).toContain('test_latency');
      expect(toolNames).toContain('test_download_speed');
      expect(toolNames).toContain('test_upload_speed');
      expect(toolNames).toContain('test_packet_loss');
      expect(toolNames).toContain('run_speed_test');
      expect(toolNames).toContain('get_connection_info');
      expect(toolNames).toContain('get_server_info');
    });

    test('should retrieve specific tools by name', () => {
      const latencyTool = registry.getTool('test_latency');
      expect(latencyTool).toBeDefined();
      expect(latencyTool!.getToolName()).toBe('test_latency');

      const nonExistentTool = registry.getTool('non_existent_tool');
      expect(nonExistentTool).toBeUndefined();
    });
  });

  describe('Tool Definitions', () => {
    test('should return tool definitions for MCP registration', () => {
      const definitions = registry.getToolDefinitions();
      expect(definitions).toHaveLength(7);

      const latencyDef = definitions.find(def => def.name === 'test_latency');
      expect(latencyDef).toBeDefined();
      expect(latencyDef!.description).toContain('latency');
      expect(latencyDef!.inputSchema).toHaveProperty('type', 'object');
      expect(latencyDef!.inputSchema.properties).toHaveProperty('timeout');
    });

    test('should have unique tool names', () => {
      const definitions = registry.getToolDefinitions();
      const names = definitions.map(def => def.name);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(names.length);
    });
  });

  describe('Tool Execution', () => {
    test('should execute existing tool successfully', async () => {
      // Mock the speed test results
      mockCloudflareClient.runSpeedTest = jest.fn().mockResolvedValue({
        getUnloadedLatency: () => 50,
        getSummary: () => ({ jitter: 3 })
      });

      mockRateLimiter.checkRateLimit = jest.fn();

      const response = await registry.executeTool('test_latency', { packetCount: 5 });

      expect(response).toBeDefined();
      expect(response.content).toHaveLength(1);
      expect(response.isError).toBeFalsy();
    });

    test('should throw error for non-existent tool', async () => {
      await expect(
        registry.executeTool('non_existent_tool', {})
      ).rejects.toThrow("Tool 'non_existent_tool' not found");
    });

    test('should handle tool execution errors gracefully', async () => {
      mockRateLimiter.checkRateLimit = jest.fn().mockImplementation(() => {
        throw new Error('Rate limit exceeded');
      });

      const response = await registry.executeTool('test_latency', {});

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('Rate limit exceeded');
    });
  });

  describe('Schema Validation', () => {
    test('all tools should have valid schemas', () => {
      const tools = registry.getAllTools();

      for (const tool of tools) {
        const schema = tool.getInputSchema();
        expect(schema).toHaveProperty('type');
        expect(schema.type).toBe('object');
        expect(schema).toHaveProperty('properties');
        expect(schema).toHaveProperty('additionalProperties', false);
      }
    });

    test('all tools should have timeout parameter', () => {
      const tools = registry.getAllTools();

      for (const tool of tools) {
        // Skip connection info and server info tools as they don't need timeout
        if (tool.getToolName() === 'get_connection_info' || tool.getToolName() === 'get_server_info') continue;

        const schema = tool.getInputSchema();
        expect(schema.properties).toHaveProperty('timeout');
        
        const timeoutProp = (schema.properties as any).timeout;
        expect(timeoutProp.type).toBe('number');
        expect(timeoutProp).toHaveProperty('minimum');
        expect(timeoutProp).toHaveProperty('maximum');
      }
    });
  });
});