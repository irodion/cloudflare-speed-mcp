/**
 * MIT License
 * Copyright (c) 2025 speed-cloudflare-mcp
 * @license SPDX-License-Identifier: MIT
 */

/**
 * Core MCP server implementation with proper lifecycle management
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ServerConfig, ServerState, McpError } from './types/mcp.js';
import { createServerConfig, getServerCapabilities } from './config/server.js';
import { logger } from './utils/logger.js';
import { RateLimiter } from './services/rate-limiter.js';
import { CloudflareSpeedTestClient } from './clients/cloudflare.js';
import { ToolRegistry } from './tools/index.js';

export class SpeedCloudflareServer {
  private mcpServer: McpServer;
  private transport: StdioServerTransport | null = null;
  private config: ServerConfig;
  private state: ServerState;
  private shutdownHandlers: (() => Promise<void>)[] = [];
  private rateLimiter: RateLimiter;
  private cloudflareClient: CloudflareSpeedTestClient;
  private toolRegistry: ToolRegistry;

  constructor(config?: Partial<ServerConfig>) {
    this.config = { ...createServerConfig(), ...config };
    this.state = {
      isConnected: false,
      isShuttingDown: false,
      startTime: new Date(),
      connectionCount: 0,
    };

    logger.setLevel(this.config.logLevel!);

    // Initialize services
    this.rateLimiter = new RateLimiter();
    this.cloudflareClient = new CloudflareSpeedTestClient();
    this.toolRegistry = new ToolRegistry(this.rateLimiter, this.cloudflareClient);

    this.mcpServer = new McpServer({
      name: this.config.name,
      version: this.config.version,
    });

    this.setupToolHandlers();
    this.setupEventHandlers();
    this.setupSignalHandlers();

    logger.debug('MCP server initialized', {
      name: this.config.name,
      version: this.config.version,
      debug: this.config.debug,
    });
  }

  async start(): Promise<void> {
    try {
      logger.info('Starting MCP server...');
      
      this.transport = new StdioServerTransport();
      await this.mcpServer.connect(this.transport);
      
      this.state.isConnected = true;
      this.state.connectionCount++;
      
      logger.info('MCP server started successfully', {
        name: this.config.name,
        version: this.config.version,
        connectionCount: this.state.connectionCount,
      });
    } catch (error) {
      const mcpError = this.createMcpError('Failed to start MCP server', error);
      logger.error(mcpError.message, { error: mcpError.details });
      throw mcpError;
    }
  }

  async stop(): Promise<void> {
    if (this.state.isShuttingDown) {
      logger.debug('Shutdown already in progress');
      return;
    }

    this.state.isShuttingDown = true;
    logger.info('Stopping MCP server...');

    try {
      // Execute shutdown handlers
      for (const handler of this.shutdownHandlers) {
        try {
          await handler();
        } catch (error) {
          logger.error('Error executing shutdown handler', { error });
        }
      }

      // Close transport
      if (this.transport) {
        await this.transport.close();
        this.transport = null;
      }

      this.state.isConnected = false;
      logger.info('MCP server stopped successfully');
    } catch (error) {
      const mcpError = this.createMcpError('Error during server shutdown', error);
      logger.error(mcpError.message, { error: mcpError.details });
      throw mcpError;
    }
  }

  getState(): ServerState {
    return { ...this.state };
  }

  getConfig(): ServerConfig {
    return { ...this.config };
  }

  addShutdownHandler(handler: () => Promise<void>): void {
    this.shutdownHandlers.push(handler);
  }

  private setupToolHandlers(): void {
    // Register all tools with the MCP server
    const tools = this.toolRegistry.getAllTools();
    
    for (const tool of tools) {
      const toolName = tool.getToolName();
      const description = tool.getDescription();
      const inputSchema = tool.getInputSchema();
      
      this.mcpServer.tool(
        toolName,
        inputSchema,
        async (args: Record<string, unknown>) => {
          logger.debug('Tool execution requested', { 
            toolName,
            args
          });

          try {
            const result = await tool.execute({
              name: toolName,
              arguments: args
            });
            return {
              content: result.content,
              isError: result.isError
            };
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error('Tool execution failed', { 
              toolName, 
              error: errorMessage 
            });
            
            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  success: false,
                  error: {
                    code: 'TOOL_EXECUTION_ERROR',
                    message: errorMessage
                  },
                  timestamp: new Date().toISOString()
                }, null, 2)
              }],
              isError: true
            };
          }
        }
      );
    }

    logger.debug('Tool handlers setup completed', {
      toolCount: tools.length
    });
  }

  private setupEventHandlers(): void {
    // MCP server handles errors internally, we can add custom error handling via transport events
    logger.debug('Event handlers setup completed');
  }

  private setupSignalHandlers(): void {
    const gracefulShutdown = async (signal: string) => {
      logger.info(`Received ${signal}, initiating graceful shutdown...`);
      try {
        await this.stop();
        process.exit(0);
      } catch (error) {
        logger.error('Error during graceful shutdown', { error });
        process.exit(1);
      }
    };

    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception', { error: error.message, stack: error.stack });
      process.exit(1);
    });

    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled promise rejection', { reason });
      process.exit(1);
    });
  }

  private createMcpError(message: string, originalError?: unknown): McpError {
    const error = new Error(message) as McpError;
    error.code = 'SERVER_ERROR';
    
    if (originalError instanceof Error) {
      error.details = {
        originalMessage: originalError.message,
        stack: originalError.stack,
      };
    } else {
      error.details = { originalError };
    }
    
    return error;
  }
}