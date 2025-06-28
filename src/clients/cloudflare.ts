import SpeedTest, { Results as CloudflareResults } from '@cloudflare/speedtest';
import { 
  SpeedTestOptions, 
  SpeedTestError, 
  ConnectionInfo, 
  ServerLocation,
  SpeedTestType,
  SpeedTestConfig,
  SpeedTestMeasurement
} from '../types/speedtest.js';
import { HttpClient, TimeoutError, RetryError } from '../utils/http.js';
import { createApiConfig, ApiConfig } from '../config/api.js';
import { logger } from '../utils/logger.js';

export class CloudflareSpeedTestClient {
  private httpClient: HttpClient;
  private config: ApiConfig;
  private logger = logger;
  private rateLimitMap: Map<string, number[]> = new Map();

  constructor(config: Partial<ApiConfig> = {}) {
    this.config = createApiConfig(config);
    this.httpClient = new HttpClient(
      this.config.timeouts.DEFAULT,
      this.config.retryConfig
    );
  }

  private checkRateLimit(operation: string): void {
    const now = Date.now();
    const windowMs = operation === 'speedTest' ? 3600000 : 60000; // 1 hour for speed tests, 1 minute for others
    const limit = operation === 'speedTest' 
      ? this.config.rateLimits.SPEED_TESTS_PER_HOUR 
      : this.config.rateLimits.REQUESTS_PER_MINUTE;

    const key = `${operation}:${Math.floor(now / windowMs)}`;
    const requests = this.rateLimitMap.get(key) || [];
    
    const validRequests = requests.filter(time => now - time < windowMs);
    
    if (validRequests.length >= limit) {
      const error: SpeedTestError = Object.assign(new Error(`Rate limit exceeded for ${operation}. Limit: ${limit} per ${windowMs / 1000}s`), {
        name: 'SpeedTestError' as const,
        code: 'RATE_LIMIT_EXCEEDED',
        retryable: false
      });
      throw error;
    }

    validRequests.push(now);
    this.rateLimitMap.set(key, validRequests);
  }

  private createSpeedTestError(message: string, code: string, details?: unknown, retryable = false): SpeedTestError {
    const error: SpeedTestError = Object.assign(new Error(message), {
      name: 'SpeedTestError' as const,
      code,
      details,
      retryable
    });
    return error;
  }

  private async executeSpeedTest(config: SpeedTestConfig): Promise<CloudflareResults> {
    return new Promise((resolve, reject) => {
      try {
        const speedTest = new SpeedTest(config);
        const timeout = setTimeout(() => {
          reject(new TimeoutError(this.config.timeouts.SPEED_TEST));
        }, this.config.timeouts.SPEED_TEST);

        speedTest.onFinish = (results: CloudflareResults): void => {
          clearTimeout(timeout);
          this.logger.debug('Speed test completed', { 
            summary: results.getSummary() 
          });
          resolve(results);
        };

        speedTest.onError = (error: string): void => {
          clearTimeout(timeout);
          this.logger.error('Speed test failed', { error });
          reject(this.createSpeedTestError(
            `Speed test execution failed: ${error}`,
            'SPEED_TEST_EXECUTION_ERROR',
            error,
            true
          ));
        };

      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        reject(this.createSpeedTestError(
          `Failed to initialize speed test: ${err.message}`,
          'SPEED_TEST_INIT_ERROR',
          err,
          false
        ));
      }
    });
  }

  async runSpeedTest(options: SpeedTestOptions = {}): Promise<CloudflareResults> {
    this.checkRateLimit('speedTest');
    
    this.logger.info('Starting speed test', { options });

    const config: SpeedTestConfig = {
      ...this.config.speedTestConfig
    };

    if (options.type && options.type !== 'full') {
      config.measurements = this.getTestMeasurements(options.type);
    }

    try {
      const results = await this.httpClient.withRetry(async () => {
        return this.executeSpeedTest(config);
      });

      this.logger.info('Speed test completed successfully', { 
        download: results.getDownloadBandwidth(),
        upload: results.getUploadBandwidth(),
        latency: results.getUnloadedLatency()
      });

      return results;
    } catch (error) {
      if (error instanceof RetryError) {
        throw this.createSpeedTestError(
          `Speed test failed after ${error.message}`,
          'SPEED_TEST_RETRY_EXHAUSTED',
          error,
          false
        );
      }
      
      if (error instanceof TimeoutError) {
        throw this.createSpeedTestError(
          `Speed test timed out after ${this.config.timeouts.SPEED_TEST}ms`,
          'SPEED_TEST_TIMEOUT',
          error,
          true
        );
      }

      throw error;
    }
  }

  private getTestMeasurements(type: SpeedTestType): SpeedTestMeasurement[] {
    const baseMeasurements = [
      { type: 'latency' as const, numPackets: 20 }
    ];

    switch (type) {
      case 'latency':
        return baseMeasurements;
      case 'download':
        return [
          ...baseMeasurements,
          { type: 'download' as const, bytes: 1e6, count: 5 },
          { type: 'download' as const, bytes: 1e7, count: 3 }
        ];
      case 'upload':
        return [
          ...baseMeasurements,
          { type: 'upload' as const, bytes: 1e6, count: 5 },
          { type: 'upload' as const, bytes: 1e7, count: 3 }
        ];
      case 'packetLoss':
        return [
          ...baseMeasurements,
          { type: 'packetLoss' as const, numPackets: 1000, responsesWaitTime: 3000 }
        ];
      default:
        return this.config.speedTestConfig.measurements || [];
    }
  }

  async getConnectionInfo(): Promise<ConnectionInfo> {
    this.checkRateLimit('connectionInfo');
    
    try {
      const response = await this.httpClient.withTimeout(
        this.httpClient.fetch('https://1.1.1.1/cdn-cgi/trace'),
        this.config.timeouts.CONNECTION_INFO
      );

      if (!response.ok) {
        const error: SpeedTestError = Object.assign(new Error(`Connection info request failed: ${response.status} ${response.statusText}`), {
          name: 'SpeedTestError' as const,
          code: 'CONNECTION_INFO_ERROR',
          details: { status: response.status, statusText: response.statusText },
          retryable: response.status >= 500
        });
        throw error;
      }

      const text = await response.text();
      return this.parseConnectionInfo(text);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.name === 'SpeedTestError') {
        throw error;
      }

      const err = error instanceof Error ? error : new Error(String(error));
      const speedTestError: SpeedTestError = Object.assign(new Error(`Failed to get connection info: ${err.message}`), {
        name: 'SpeedTestError' as const,
        code: 'CONNECTION_INFO_NETWORK_ERROR',
        details: err,
        retryable: true
      });
      throw speedTestError;
    }
  }

  private parseConnectionInfo(traceText: string): ConnectionInfo {
    const lines = traceText.split('\n');
    const data: Record<string, string> = {};

    for (const line of lines) {
      const [key, value] = line.split('=');
      if (key && value) {
        data[key.trim()] = value.trim();
      }
    }

    return {
      ip: data.ip || 'unknown',
      isp: data.isp || 'unknown', 
      country: data.loc || 'unknown',
      region: data.region || 'unknown',
      city: data.city || 'unknown',
      timezone: data.timezone || 'unknown'
    };
  }

  async discoverServers(): Promise<ServerLocation[]> {
    this.checkRateLimit('serverDiscovery');
    
    try {
      const response = await this.httpClient.withTimeout(
        this.httpClient.fetch('https://speed.cloudflare.com/locations'),
        this.config.timeouts.DEFAULT
      );

      if (!response.ok) {
        const error: SpeedTestError = Object.assign(new Error(`Server discovery failed: ${response.status} ${response.statusText}`), {
          name: 'SpeedTestError' as const,
          code: 'SERVER_DISCOVERY_ERROR',
          details: { status: response.status, statusText: response.statusText },
          retryable: response.status >= 500
        });
        throw error;
      }

      const servers = await response.json();
      return this.parseServerLocations(servers);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.name === 'SpeedTestError') {
        throw error;
      }

      const err = error instanceof Error ? error : new Error(String(error));
      const speedTestError: SpeedTestError = Object.assign(new Error(`Failed to discover servers: ${err.message}`), {
        name: 'SpeedTestError' as const,
        code: 'SERVER_DISCOVERY_NETWORK_ERROR',
        details: err,
        retryable: true
      });
      throw speedTestError;
    }
  }

  private parseServerLocations(serversData: unknown): ServerLocation[] {
    if (!Array.isArray(serversData)) {
      return [];
    }

    return serversData.map(server => ({
      name: server.iata || server.name || 'unknown',
      location: `${server.city || 'unknown'}, ${server.region || 'unknown'}`,
      country: server.country || 'unknown',
      city: server.city || 'unknown', 
      region: server.region || 'unknown',
      latitude: server.lat,
      longitude: server.lon,
      distance: server.distance
    }));
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.httpClient.withTimeout(
        this.httpClient.fetch('https://speed.cloudflare.com/api/health'),
        5000
      );
      return response.ok;
    } catch {
      return false;
    }
  }
}