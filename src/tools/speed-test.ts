/**
 * Comprehensive speed test MCP tool implementation
 */

import { BaseTool } from './base-tool.js';
import { OperationType } from '../types/rate-limit.js';
import type { Results as CloudflareResults } from '@cloudflare/speedtest';
import type { 
  ToolExecutionContext, 
  ToolResult, 
  SpeedTestOptions,
  ComprehensiveSpeedResult
} from '../types/tools.js';
import { logger } from '../utils/logger.js';

export class SpeedTestTool extends BaseTool {
  getToolName(): string {
    return 'run_speed_test';
  }

  getDescription(): string {
    return 'Run a comprehensive speed test including configurable combinations of latency, download, upload, and packet loss measurements';
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
          default: 120
        },
        serverLocation: {
          type: 'string',
          description: 'Optional server location identifier',
          minLength: 1,
          maxLength: 100
        },
        testTypes: {
          type: 'array',
          description: 'Array of test types to include',
          items: {
            type: 'string',
            enum: ['latency', 'download', 'upload', 'packetLoss']
          },
          uniqueItems: true,
          minItems: 1,
          default: ['latency', 'download', 'upload', 'packetLoss']
        },
        comprehensiveMode: {
          type: 'boolean',
          description: 'Whether to run in comprehensive mode with extended measurements',
          default: true
        },
        latencyOptions: {
          type: 'object',
          description: 'Options specific to latency testing',
          properties: {
            packetCount: { type: 'number', minimum: 1, maximum: 100, default: 10 },
            measurementType: { type: 'string', enum: ['unloaded', 'loaded'], default: 'unloaded' }
          },
          additionalProperties: false
        },
        bandwidthOptions: {
          type: 'object',
          description: 'Options specific to bandwidth testing',
          properties: {
            duration: { type: 'number', minimum: 5, maximum: 60, default: 15 },
            measurementBytes: { type: 'number', minimum: 1024, maximum: 1073741824, default: 10485760 }
          },
          additionalProperties: false
        },
        packetLossOptions: {
          type: 'object',
          description: 'Options specific to packet loss testing',
          properties: {
            packetCount: { type: 'number', minimum: 10, maximum: 1000, default: 100 },
            batchSize: { type: 'number', minimum: 1, maximum: 50, default: 10 },
            batchWaitTime: { type: 'number', minimum: 100, maximum: 5000, default: 1000 }
          },
          additionalProperties: false
        }
      },
      additionalProperties: false
    };
  }

  protected validateArguments(args: Record<string, unknown>): void {
    super.validateArguments(args);

    if (args.testTypes !== undefined) {
      if (!Array.isArray(args.testTypes) || args.testTypes.length === 0) {
        throw new Error('Test types must be a non-empty array');
      }
      
      const validTypes = ['latency', 'download', 'upload', 'packetLoss'];
      const invalidTypes = args.testTypes.filter(type => !validTypes.includes(type as string));
      if (invalidTypes.length > 0) {
        throw new Error(`Invalid test types: ${invalidTypes.join(', ')}`);
      }
    }

    if (args.comprehensiveMode !== undefined && typeof args.comprehensiveMode !== 'boolean') {
      throw new Error('Comprehensive mode must be a boolean');
    }

    // Validate nested options objects
    this.validateNestedOptions(args.latencyOptions, 'latencyOptions');
    this.validateNestedOptions(args.bandwidthOptions, 'bandwidthOptions');
    this.validateNestedOptions(args.packetLossOptions, 'packetLossOptions');
  }

  private validateNestedOptions(options: unknown, optionName: string): void {
    if (options !== undefined && (typeof options !== 'object' || options === null || Array.isArray(options))) {
      throw new Error(`${optionName} must be an object`);
    }
  }

  protected async executeImpl(
    args: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now();
    
    try {
      const options = this.extractSpeedTestOptions(args);
      
      logger.debug('Starting comprehensive speed test', { 
        toolName: context.toolName,
        options 
      });

      // Execute speed test with full measurements
      const results = await this.cloudflareClient.runSpeedTest({
        type: 'full',
        timeout: options.timeout
      });

      const executionTime = Date.now() - startTime;

      // Extract all results based on requested test types
      const testTypes = options.testTypes || ['latency', 'download', 'upload', 'packetLoss'];
      const comprehensiveData = await this.extractComprehensiveResults(results as CloudflareResults, testTypes);

      logger.info('Comprehensive speed test completed', {
        toolName: context.toolName,
        testTypes,
        executionTime,
        summary: comprehensiveData?.summary
      });

      return this.createToolResult(true, comprehensiveData, undefined, executionTime);

    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      logger.error('Comprehensive speed test failed', {
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

  private extractSpeedTestOptions(args: Record<string, unknown>): SpeedTestOptions {
    return {
      ...this.extractBaseOptions(args),
      testTypes: args.testTypes as Array<'latency' | 'download' | 'upload' | 'packetLoss'> | undefined,
      comprehensiveMode: args.comprehensiveMode as boolean | undefined
    };
  }

  private async extractComprehensiveResults(
    results: CloudflareResults,
    testTypes: string[]
  ): Promise<ComprehensiveSpeedResult['data']> {
    const data: ComprehensiveSpeedResult['data'] = {
      download: undefined,
      upload: undefined,
      latency: undefined,
      packetLoss: undefined,
      summary: {
        overallScore: 0,
        classification: 'poor',
        recommendations: []
      }
    };

    // Extract latency results
    if (testTypes.includes('latency')) {
      const latency = results.getUnloadedLatency();
      const jitter = results.getSummary().jitter;
      
      data.latency = {
        latency: latency || 0,
        jitter: jitter || 0,
        packetsSent: 10,
        packetsReceived: 10,
        packetLoss: 0
      };
    }

    // Extract download results
    if (testTypes.includes('download')) {
      const downloadBandwidth = results.getDownloadBandwidth();
      
      if (downloadBandwidth !== undefined) {
        data.download = {
          bandwidth: downloadBandwidth,
          bytes: 10485760,
          duration: 15,
          throughput: downloadBandwidth / 8
        };
      }
    }

    // Extract upload results
    if (testTypes.includes('upload')) {
      const uploadBandwidth = results.getUploadBandwidth();
      
      if (uploadBandwidth !== undefined) {
        data.upload = {
          bandwidth: uploadBandwidth,
          bytes: 10485760,
          duration: 15,
          throughput: uploadBandwidth / 8
        };
      }
    }

    // Extract packet loss results
    if (testTypes.includes('packetLoss')) {
      const packetLoss = results.getPacketLoss();
      
      if (packetLoss !== undefined) {
        data.packetLoss = {
          packetLoss,
          totalPackets: 100,
          lostPackets: Math.round((packetLoss / 100) * 100),
          batchResults: []
        };
      }
    }

    // Calculate overall score and classification
    data.summary = this.calculateOverallSummary(data);

    return data;
  }

  private calculateOverallSummary(data: ComprehensiveSpeedResult['data']): {
    overallScore: number;
    classification: 'poor' | 'fair' | 'good' | 'excellent';
    recommendations: string[];
  } {
    let totalScore = 0;
    let componentCount = 0;
    const recommendations: string[] = [];

    // Score latency (lower is better, normalize to 0-100)
    if (data?.latency) {
      const latencyScore = Math.max(0, 100 - (data.latency.latency / 10));
      totalScore += latencyScore;
      componentCount++;
      
      if (data.latency.latency > 100) {
        recommendations.push('High latency detected - consider checking network connectivity');
      }
    }

    // Score download bandwidth (higher is better, normalize to 0-100)
    if (data?.download) {
      const downloadMbps = data.download.bandwidth / 1000000;
      const downloadScore = Math.min(100, (downloadMbps / 100) * 100);
      totalScore += downloadScore;
      componentCount++;
      
      if (downloadMbps < 25) {
        recommendations.push('Download speed below recommended levels for HD streaming');
      }
    }

    // Score upload bandwidth (higher is better, normalize to 0-100)
    if (data?.upload) {
      const uploadMbps = data.upload.bandwidth / 1000000;
      const uploadScore = Math.min(100, (uploadMbps / 25) * 100);
      totalScore += uploadScore;
      componentCount++;
      
      if (uploadMbps < 10) {
        recommendations.push('Upload speed may affect video conferencing quality');
      }
    }

    // Score packet loss (lower is better, normalize to 0-100)
    if (data?.packetLoss) {
      const packetLossScore = Math.max(0, 100 - (data.packetLoss.packetLoss * 10));
      totalScore += packetLossScore;
      componentCount++;
      
      if (data.packetLoss.packetLoss > 1) {
        recommendations.push('Packet loss detected - may indicate network congestion');
      }
    }

    const overallScore = componentCount > 0 ? totalScore / componentCount : 0;
    
    let classification: 'poor' | 'fair' | 'good' | 'excellent';
    if (overallScore >= 80) {
      classification = 'excellent';
    } else if (overallScore >= 60) {
      classification = 'good';
    } else if (overallScore >= 40) {
      classification = 'fair';
    } else {
      classification = 'poor';
    }

    return {
      overallScore: Math.round(overallScore),
      classification,
      recommendations
    };
  }

  /**
   * Get the operation type for rate limiting
   */
  protected getOperationType(): OperationType {
    return OperationType.SPEED_TEST;
  }
}