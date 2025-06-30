/**
 * Upload speed test MCP tool implementation
 */

import { BaseTool } from './base-tool.js';
import { OperationType } from '../types/rate-limit.js';
import type { 
  ToolExecutionContext, 
  ToolResult, 
  BandwidthTestOptions
} from '../types/tools.js';
import type { SpeedTestMeasurement } from '../types/speedtest.js';
import { logger } from '../utils/logger.js';

export class UploadTestTool extends BaseTool {
  getToolName(): string {
    return 'test_upload_speed';
  }

  getDescription(): string {
    return 'Measure upload bandwidth speed with configurable duration and data amount';
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
          default: 30
        },
        serverLocation: {
          type: 'string',
          description: 'Optional server location identifier',
          minLength: 1,
          maxLength: 100
        },
        duration: {
          type: 'number',
          description: 'Test duration in seconds',
          minimum: 5,
          maximum: 60,
          default: 15
        },
        measurementBytes: {
          type: 'number',
          description: 'Amount of data to upload in bytes',
          minimum: 1024,
          maximum: 1073741824,
          default: 10485760
        }
      },
      additionalProperties: false
    };
  }

  protected validateArguments(args: Record<string, unknown>): void {
    super.validateArguments(args);

    if (args.duration !== undefined) {
      if (typeof args.duration !== 'number' || args.duration < 5 || args.duration > 60) {
        throw new Error('Duration must be a number between 5 and 60 seconds');
      }
    }

    if (args.measurementBytes !== undefined) {
      if (typeof args.measurementBytes !== 'number' || 
          args.measurementBytes < 1024 || 
          args.measurementBytes > 1073741824) {
        throw new Error('Measurement bytes must be between 1KB and 1GB');
      }
    }
  }

  protected async executeImpl(
    args: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now();
    
    try {
      const options = this.extractBandwidthOptions(args);
      
      logger.debug('Starting upload speed test', { 
        toolName: context.toolName,
        options 
      });

      // Execute speed test with upload measurements only
      const results = await this.cloudflareClient.runSpeedTest({
        type: 'upload',
        timeout: options.timeout
      });

      const executionTime = Date.now() - startTime;

      // Extract upload-specific results
      const uploadBandwidth = results.getUploadBandwidth();
      
      if (uploadBandwidth === undefined) {
        throw new Error('Upload bandwidth measurement failed - no results returned');
      }

      const uploadData = {
        bandwidth: uploadBandwidth, // bits per second
        bytes: options.measurementBytes || 10485760,
        duration: options.duration || 15,
        throughput: uploadBandwidth / 8 // bytes per second
      };

      logger.info('Upload speed test completed', {
        toolName: context.toolName,
        bandwidth: uploadData.bandwidth,
        throughput: uploadData.throughput,
        executionTime
      });

      return this.createToolResult(true, uploadData, undefined, executionTime);

    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      logger.error('Upload speed test failed', {
        toolName: context.toolName,
        error: errorMessage,
        executionTime
      });

      return this.createToolResult(
        false,
        undefined,
        {
          code: this.getErrorCode(error),
          message: errorMessage,
          details: error instanceof Error ? { name: error.name, stack: error.stack } : undefined
        },
        executionTime
      );
    }
  }

  private extractBandwidthOptions(args: Record<string, unknown>): BandwidthTestOptions {
    return {
      ...this.extractBaseOptions(args),
      duration: args.duration as number | undefined,
      measurementBytes: args.measurementBytes as number | undefined
    };
  }

  private createUploadMeasurements(options: BandwidthTestOptions): SpeedTestMeasurement[] {
    const bytes = options.measurementBytes || 10485760; // 10MB default
    const count = Math.max(1, Math.floor((options.duration || 15) / 5)); // Roughly 5 seconds per measurement
    
    return [{
      type: 'upload',
      bytes,
      count,
      bypassMinDuration: false
    }];
  }

  /**
   * Get the operation type for rate limiting
   */
  protected getOperationType(): OperationType {
    return OperationType.UPLOAD_TEST;
  }
}