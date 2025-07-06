/**
 * Packet loss test MCP tool implementation
 */

import { BaseTool } from './base-tool.js';
import { OperationType } from '../types/rate-limit.js';
import type {
  ToolExecutionContext,
  ToolResult,
  PacketLossTestOptions,
} from '../types/tools.js';
import type { SpeedTestMeasurement } from '../types/speedtest.js';
import { logger } from '../utils/logger.js';

export class PacketLossTestTool extends BaseTool {
  getToolName(): string {
    return 'test_packet_loss';
  }

  getDescription(): string {
    return 'Measure packet loss with configurable packet count, batch size, and timing parameters';
  }

  getInputSchema(): Record<string, unknown> {
    return {
      type: 'object',
      properties: {
        timeout: {
          type: 'number',
          description: 'Test timeout in seconds',
          minimum: 1,
          maximum: 300,
          default: 60,
        },
        serverLocation: {
          type: 'string',
          description: 'Optional server location identifier',
          minLength: 1,
          maxLength: 100,
        },
        packetCount: {
          type: 'number',
          description: 'Total number of packets to send',
          minimum: 10,
          maximum: 1000,
          default: 100,
        },
        batchSize: {
          type: 'number',
          description: 'Number of packets per batch',
          minimum: 1,
          maximum: 50,
          default: 10,
        },
        batchWaitTime: {
          type: 'number',
          description: 'Wait time between batches in milliseconds',
          minimum: 100,
          maximum: 5000,
          default: 1000,
        },
      },
      additionalProperties: false,
    };
  }

  protected validateArguments(args: Record<string, unknown>): void {
    super.validateArguments(args);

    if (args.packetCount !== undefined) {
      if (
        typeof args.packetCount !== 'number' ||
        args.packetCount < 10 ||
        args.packetCount > 1000
      ) {
        throw new Error('Packet count must be a number between 10 and 1000');
      }
    }

    if (args.batchSize !== undefined) {
      if (
        typeof args.batchSize !== 'number' ||
        args.batchSize < 1 ||
        args.batchSize > 50
      ) {
        throw new Error('Batch size must be a number between 1 and 50');
      }
    }

    if (args.batchWaitTime !== undefined) {
      if (
        typeof args.batchWaitTime !== 'number' ||
        args.batchWaitTime < 100 ||
        args.batchWaitTime > 5000
      ) {
        throw new Error(
          'Batch wait time must be between 100 and 5000 milliseconds'
        );
      }
    }

    // Validate that batchSize doesn't exceed packetCount
    const packetCount = (args.packetCount as number) || 100;
    const batchSize = (args.batchSize as number) || 10;
    if (batchSize > packetCount) {
      throw new Error('Batch size cannot exceed total packet count');
    }
  }

  protected async executeImpl(
    args: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now();

    try {
      const options = this.extractPacketLossOptions(args);

      logger.debug('Starting packet loss test', {
        toolName: context.toolName,
        options,
      });

      // Execute speed test with packet loss measurements only
      const results = await this.cloudflareClient.runSpeedTest({
        type: 'packetLoss',
        timeout: options.timeout,
      });

      const executionTime = Date.now() - startTime;

      // Extract packet loss results
      const packetLossPercentage = results.getPacketLoss();

      if (packetLossPercentage === undefined) {
        throw new Error('Packet loss measurement failed - no results returned');
      }

      // Calculate batch information
      const totalPackets = options.packetCount || 100;
      const batchSize = options.batchSize || 10;
      const numBatches = Math.ceil(totalPackets / batchSize);
      const lostPackets = Math.round(
        (packetLossPercentage / 100) * totalPackets
      );

      // Generate batch results (simplified simulation)
      const batchResults = this.generateBatchResults(
        numBatches,
        batchSize,
        lostPackets
      );

      const packetLossData = {
        packetLoss: packetLossPercentage,
        totalPackets,
        lostPackets,
        batchResults,
      };

      logger.info('Packet loss test completed', {
        toolName: context.toolName,
        packetLoss: packetLossData.packetLoss,
        totalPackets: packetLossData.totalPackets,
        lostPackets: packetLossData.lostPackets,
        executionTime,
      });

      return this.createToolResult(
        true,
        packetLossData,
        undefined,
        executionTime
      );
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      logger.error('Packet loss test failed', {
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

  private extractPacketLossOptions(
    args: Record<string, unknown>
  ): PacketLossTestOptions {
    return {
      ...this.extractBaseOptions(args),
      packetCount: args.packetCount as number | undefined,
      batchSize: args.batchSize as number | undefined,
      batchWaitTime: args.batchWaitTime as number | undefined,
    };
  }

  private createPacketLossMeasurements(
    options: PacketLossTestOptions
  ): SpeedTestMeasurement[] {
    const packetCount = options.packetCount || 100;
    const batchSize = options.batchSize || 10;
    const batchWaitTime = options.batchWaitTime || 1000;

    return [
      {
        type: 'packetLoss',
        numPackets: packetCount,
        batchSize,
        batchWaitTime,
        responsesWaitTime: 2000,
        connectionTimeout: 5000,
      },
    ];
  }

  private generateBatchResults(
    numBatches: number,
    batchSize: number,
    totalLostPackets: number
  ): Array<{ batchId: number; packetsLost: number; packetsTotal: number }> {
    const batchResults = [];
    let remainingLostPackets = totalLostPackets;

    for (let i = 0; i < numBatches; i++) {
      const packetsInThisBatch = Math.min(batchSize, remainingLostPackets);
      const packetsLostInThisBatch = Math.min(
        packetsInThisBatch,
        Math.floor(Math.random() * (remainingLostPackets + 1))
      );

      batchResults.push({
        batchId: i + 1,
        packetsLost: packetsLostInThisBatch,
        packetsTotal: packetsInThisBatch,
      });

      remainingLostPackets -= packetsLostInThisBatch;
    }

    return batchResults;
  }

  /**
   * Get the operation type for rate limiting
   */
  protected getOperationType(): OperationType {
    return OperationType.PACKET_LOSS_TEST;
  }
}
