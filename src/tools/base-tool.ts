/**
 * Base tool class providing common functionality for all MCP speed test tools
 */

import { RateLimiter } from '../services/rate-limiter.js';
import { OperationType } from '../types/rate-limit.js';
import { CloudflareSpeedTestClient } from '../clients/cloudflare.js';
import { logger } from '../utils/logger.js';
import type { 
  McpToolRequest, 
  McpToolResponse, 
  ToolExecutionContext, 
  ToolResult,
  BaseToolOptions 
} from '../types/tools.js';

export abstract class BaseTool {
  protected rateLimiter: RateLimiter;
  protected cloudflareClient: CloudflareSpeedTestClient;
  
  constructor(rateLimiter: RateLimiter, cloudflareClient: CloudflareSpeedTestClient) {
    this.rateLimiter = rateLimiter;
    this.cloudflareClient = cloudflareClient;
  }

  /**
   * Execute the tool with common error handling and rate limiting
   */
  async execute(request: McpToolRequest): Promise<McpToolResponse> {
    const context: ToolExecutionContext = {
      toolName: this.getToolName(),
      startTime: new Date(),
      timeout: this.extractTimeout(request.arguments)
    };

    try {
      // Validate input arguments
      this.validateArguments(request.arguments || {});

      // Check rate limiting
      await this.checkRateLimit();

      // Execute the specific tool implementation
      const result = await this.executeImpl(request.arguments || {}, context);

      // Format and return response
      if (!result.success) {
        // Preserve error details from ToolResult
        const error = result.error || { code: 'EXECUTION_ERROR', message: 'Tool execution failed' };
        const preservedError = Object.assign(new Error(error.message), {
          code: error.code,
          details: error.details
        });
        return this.formatErrorResponse(preservedError, context);
      }
      return this.formatResponse(result);

    } catch (error) {
      logger.error(`Tool execution failed: ${context.toolName}`, { 
        error: error instanceof Error ? error.message : String(error),
        toolName: context.toolName,
        arguments: request.arguments
      });

      return this.formatErrorResponse(error, context);
    }
  }

  /**
   * Get the tool name for registration and logging
   */
  abstract getToolName(): string;

  /**
   * Get the tool description for MCP registration
   */
  abstract getDescription(): string;

  /**
   * Get the JSON schema for tool input validation
   */
  abstract getInputSchema(): Record<string, unknown>;

  /**
   * Validate input arguments against the tool's schema
   */
  protected validateArguments(args: Record<string, unknown>): void {
    // Basic validation - can be extended by subclasses
    if (args.timeout !== undefined) {
      if (typeof args.timeout !== 'number' || args.timeout <= 0 || args.timeout > 300) {
        throw new Error('Timeout must be a positive number between 1 and 300 seconds');
      }
    }

    if (args.serverLocation !== undefined) {
      if (typeof args.serverLocation !== 'string' || args.serverLocation.trim().length === 0) {
        throw new Error('Server location must be a non-empty string');
      }
    }
  }

  /**
   * Get the operation type for rate limiting
   */
  protected abstract getOperationType(): OperationType;

  /**
   * Check rate limiting before executing the tool
   */
  protected async checkRateLimit(): Promise<void> {
    this.rateLimiter.checkRateLimit(this.getOperationType());
  }

  /**
   * Extract timeout from arguments with tool-specific defaults
   */
  protected extractTimeout(args?: Record<string, unknown>): number | undefined {
    if (args?.timeout && typeof args.timeout === 'number') {
      return args.timeout * 1000; // Convert to milliseconds
    }
    return undefined;
  }

  /**
   * Extract base options common to all tools
   */
  protected extractBaseOptions(args: Record<string, unknown>): BaseToolOptions {
    return {
      timeout: args.timeout as number | undefined,
      serverLocation: args.serverLocation as string | undefined
    };
  }

  /**
   * Format successful tool response
   */
  protected formatResponse(result: ToolResult): McpToolResponse {
    const response = {
      success: result.success,
      data: result.data,
      executionTime: result.executionTime,
      timestamp: result.timestamp
    };

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(response, null, 2)
      }]
    };
  }

  /**
   * Format error response
   */
  protected formatErrorResponse(error: unknown, context: ToolExecutionContext): McpToolResponse {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const executionTime = Date.now() - context.startTime.getTime();

    // Preserve details from original error object if available
    let details;
    if (error && typeof error === 'object' && 'details' in error) {
      details = error.details;
    } else if (error instanceof Error) {
      details = {
        name: error.name,
        stack: error.stack
      };
    }

    const response = {
      success: false,
      error: {
        code: this.getErrorCode(error),
        message: errorMessage,
        details
      },
      executionTime,
      timestamp: new Date().toISOString(),
      toolName: context.toolName
    };

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(response, null, 2)
      }],
      isError: true
    };
  }

  /**
   * Get appropriate error code based on error type
   */
  protected getErrorCode(error: unknown): string {
    // First check if error has a code property (preserve original error codes)
    if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
      return error.code;
    }
    
    if (error instanceof Error) {
      if (error.message.includes('timeout')) {
        return 'TIMEOUT_ERROR';
      }
      if (error.message.includes('rate limit')) {
        return 'RATE_LIMIT_ERROR';
      }
      if (error.message.includes('validation') || error.message.includes('invalid')) {
        return 'VALIDATION_ERROR';
      }
      if (error.message.includes('network') || error.message.includes('connection')) {
        return 'NETWORK_ERROR';
      }
    }
    return 'EXECUTION_ERROR';
  }

  /**
   * Create a standardized tool result
   */
  protected createToolResult(
    success: boolean,
    data?: unknown,
    error?: { code: string; message: string; details?: unknown },
    executionTime?: number
  ): ToolResult {
    return {
      success,
      data,
      error,
      executionTime: executionTime || 0,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Abstract method for tool-specific implementation
   */
  protected abstract executeImpl(
    args: Record<string, unknown>, 
    context: ToolExecutionContext
  ): Promise<ToolResult>;
}