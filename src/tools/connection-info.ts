/**
 * Connection info MCP tool implementation
 */

import { BaseTool } from './base-tool.js';
import { OperationType } from '../types/rate-limit.js';
import type {
  ToolExecutionContext,
  ToolResult,
  ConnectionInfoOptions,
  ConnectionInfoResult,
} from '../types/tools.js';
import { logger } from '../utils/logger.js';

export class ConnectionInfoTool extends BaseTool {
  getToolName(): string {
    return 'get_connection_info';
  }

  getDescription(): string {
    return 'Get detailed information about the current network connection including IP, ISP, and location data';
  }

  getInputSchema(): Record<string, unknown> {
    return {
      type: 'object',
      properties: {
        includeLocation: {
          type: 'boolean',
          description: 'Whether to include detailed location information',
          default: true,
        },
        includeISP: {
          type: 'boolean',
          description: 'Whether to include ISP and network information',
          default: true,
        },
      },
      additionalProperties: false,
    };
  }

  protected validateArguments(args: Record<string, unknown>): void {
    if (
      args.includeLocation !== undefined &&
      typeof args.includeLocation !== 'boolean'
    ) {
      throw new Error('includeLocation must be a boolean');
    }

    if (args.includeISP !== undefined && typeof args.includeISP !== 'boolean') {
      throw new Error('includeISP must be a boolean');
    }
  }

  protected async executeImpl(
    args: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now();

    try {
      const options = this.extractConnectionInfoOptions(args);

      logger.debug('Getting connection information', {
        toolName: context.toolName,
        options,
      });

      // Get connection info through Cloudflare's API
      // Note: This is a simplified implementation - actual implementation would need
      // to call appropriate Cloudflare APIs or use external IP services
      const connectionData = await this.getConnectionDetails(options);

      const executionTime = Date.now() - startTime;

      logger.info('Connection info retrieved', {
        toolName: context.toolName,
        ip: connectionData?.ip,
        country: connectionData?.location?.country,
        executionTime,
      });

      return this.createToolResult(
        true,
        connectionData,
        undefined,
        executionTime
      );
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      logger.error('Failed to get connection info', {
        toolName: context.toolName,
        error: errorMessage,
        executionTime,
      });

      return this.createToolResult(
        false,
        undefined,
        {
          code: this.getErrorCode(error),
          message: errorMessage,
          details:
            error instanceof Error
              ? { name: error.name, stack: error.stack }
              : undefined,
        },
        executionTime
      );
    }
  }

  private extractConnectionInfoOptions(
    args: Record<string, unknown>
  ): ConnectionInfoOptions {
    return {
      includeLocation: args.includeLocation as boolean | undefined,
      includeISP: args.includeISP as boolean | undefined,
    };
  }

  private async getConnectionDetails(
    options: ConnectionInfoOptions
  ): Promise<ConnectionInfoResult['data']> {
    // Get real connection information from Cloudflare
    const connectionInfo = await this.cloudflareClient.getConnectionInfo();

    // Build the connection data structure
    const connectionData: ConnectionInfoResult['data'] = {
      ip: connectionInfo.ip,
      isp: options.includeISP !== false ? connectionInfo.isp : 'Hidden',
      connection: {
        type: 'broadband', // Cloudflare doesn't provide this, using default
        asn: 0, // Cloudflare trace API doesn't provide ASN
        organization: options.includeISP !== false ? connectionInfo.isp : 'Hidden',
      },
    };

    // Add location data if requested
    if (options.includeLocation !== false) {
      connectionData.location = {
        country: connectionInfo.country,
        region: connectionInfo.region,
        city: connectionInfo.city,
        timezone: connectionInfo.timezone,
      };
    }

    return connectionData;
  }

  /**
   * Get the operation type for rate limiting
   */
  protected getOperationType(): OperationType {
    return OperationType.CONNECTION_INFO;
  }
}
