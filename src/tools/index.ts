/**
 * MCP Tools registry and exports
 */

import { RateLimiter } from '../services/rate-limiter.js';
import { CloudflareSpeedTestClient } from '../clients/cloudflare.js';
import type { McpToolResponse } from '../types/tools.js';
import { BaseTool } from './base-tool.js';
import { LatencyTestTool } from './latency-test.js';
import { DownloadTestTool } from './download-test.js';
import { UploadTestTool } from './upload-test.js';
import { PacketLossTestTool } from './packet-loss-test.js';
import { SpeedTestTool } from './speed-test.js';
import { ConnectionInfoTool } from './connection-info.js';
import { ServerInfoTool } from './server-info.js';

export {
  BaseTool,
  LatencyTestTool,
  DownloadTestTool,
  UploadTestTool,
  PacketLossTestTool,
  SpeedTestTool,
  ConnectionInfoTool,
  ServerInfoTool,
};

/**
 * Tool registry for MCP server registration
 */
export class ToolRegistry {
  private tools: Map<string, BaseTool> = new Map();

  constructor(
    rateLimiter: RateLimiter,
    cloudflareClient: CloudflareSpeedTestClient
  ) {
    // Initialize all tools
    const toolInstances = [
      new LatencyTestTool(rateLimiter, cloudflareClient),
      new DownloadTestTool(rateLimiter, cloudflareClient),
      new UploadTestTool(rateLimiter, cloudflareClient),
      new PacketLossTestTool(rateLimiter, cloudflareClient),
      new SpeedTestTool(rateLimiter, cloudflareClient),
      new ConnectionInfoTool(rateLimiter, cloudflareClient),
      new ServerInfoTool(rateLimiter, cloudflareClient),
    ];

    // Register tools by name
    for (const tool of toolInstances) {
      this.tools.set(tool.getToolName(), tool);
    }
  }

  /**
   * Get all registered tools
   */
  getAllTools(): BaseTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get a specific tool by name
   */
  getTool(name: string): BaseTool | undefined {
    return this.tools.get(name);
  }

  /**
   * Get tool definitions for MCP server registration
   */
  getToolDefinitions(): Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
  }> {
    return this.getAllTools().map((tool) => ({
      name: tool.getToolName(),
      description: tool.getDescription(),
      inputSchema: tool.getInputSchema(),
    }));
  }

  /**
   * Execute a tool by name with the given arguments
   */
  async executeTool(
    name: string,
    args?: Record<string, unknown>
  ): Promise<McpToolResponse> {
    const tool = this.getTool(name);
    if (!tool) {
      throw new Error(`Tool '${name}' not found`);
    }

    return await tool.execute({
      name,
      arguments: args,
    });
  }
}
