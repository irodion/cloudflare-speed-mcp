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
    return 'Get information about the current network connection including IP address and country from the Cloudflare trace API';
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
    const connectionInfo = await this.cloudflareClient.getConnectionInfo();

    const connectionData: ConnectionInfoResult['data'] = {
      ip: connectionInfo.ip,
      isp: options.includeISP !== false ? connectionInfo.isp : null,
      connection: {
        type: null,
        asn: null,
        organization: connectionInfo.isp,
      },
      raw: connectionInfo.raw,
    };

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

  protected getOperationType(): OperationType {
    return OperationType.CONNECTION_INFO;
  }
}
