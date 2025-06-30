/**
 * Tool-related type definitions for MCP speed test tools
 */

export interface McpToolRequest {
  name: string;
  arguments?: Record<string, unknown>;
}

export interface McpToolResponse {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  isError?: boolean;
}

export interface ToolExecutionContext {
  toolName: string;
  startTime: Date;
  timeout?: number;
}

export interface BaseToolOptions {
  timeout?: number;
  serverLocation?: string;
}

export interface LatencyTestOptions extends BaseToolOptions {
  packetCount?: number;
  measurementType?: 'unloaded' | 'loaded';
}

export interface BandwidthTestOptions extends BaseToolOptions {
  duration?: number;
  measurementBytes?: number;
}

export interface PacketLossTestOptions extends BaseToolOptions {
  packetCount?: number;
  batchSize?: number;
  batchWaitTime?: number;
}

export interface SpeedTestOptions extends BaseToolOptions {
  testTypes?: Array<'latency' | 'download' | 'upload' | 'packetLoss'>;
  comprehensiveMode?: boolean;
}

export interface ConnectionInfoOptions extends BaseToolOptions {
  includeLocation?: boolean;
  includeISP?: boolean;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  executionTime: number;
  timestamp: string;
}

export interface LatencyResult extends ToolResult {
  data?: {
    latency: number;
    jitter: number;
    packetsSent: number;
    packetsReceived: number;
    packetLoss: number;
  };
}

export interface BandwidthResult extends ToolResult {
  data?: {
    bandwidth: number;
    bytes: number;
    duration: number;
    throughput: number;
  };
}

export interface PacketLossResult extends ToolResult {
  data?: {
    packetLoss: number;
    totalPackets: number;
    lostPackets: number;
    batchResults: Array<{
      batchId: number;
      packetsLost: number;
      packetsTotal: number;
    }>;
  };
}

export interface ComprehensiveSpeedResult extends ToolResult {
  data?: {
    download: BandwidthResult['data'];
    upload: BandwidthResult['data'];
    latency: LatencyResult['data'];
    packetLoss: PacketLossResult['data'];
    summary: {
      overallScore: number;
      classification: 'poor' | 'fair' | 'good' | 'excellent';
      recommendations?: string[];
    };
  };
}

export interface ConnectionInfoResult extends ToolResult {
  data?: {
    ip: string;
    isp: string;
    location?: {
      country: string;
      region: string;
      city: string;
      timezone: string;
      coordinates?: {
        latitude: number;
        longitude: number;
      };
    };
    connection: {
      type: string;
      asn: number;
      organization: string;
    };
  };
}