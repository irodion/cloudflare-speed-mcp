import SpeedTest, { Results as CloudflareResults } from '@cloudflare/speedtest';
import {
  SpeedTestOptions,
  SpeedTestError,
  ConnectionInfo,
  ServerLocation,
  SpeedTestType,
  SpeedTestConfig,
  SpeedTestMeasurement,
} from '../types/speedtest.js';
import { HttpClient, TimeoutError } from '../utils/http.js';
import { createApiConfig, ApiConfig } from '../config/api.js';
import { logger } from '../utils/logger.js';
import { setupWebRTCPolyfill } from '../utils/webrtc-polyfill.js';

// Setup WebRTC polyfill for Node.js environment
setupWebRTCPolyfill();

/**
 * Client for Cloudflare speed test and connection info APIs.
 *
 * Rate limiting is NOT handled here — it's the caller's responsibility
 * (handled by RateLimiter service via BaseTool).
 */
export class CloudflareSpeedTestClient {
  private httpClient: HttpClient;
  private config: ApiConfig;

  constructor(config: Partial<ApiConfig> = {}) {
    this.config = createApiConfig(config);
    this.httpClient = new HttpClient(
      this.config.timeouts.DEFAULT,
      this.config.retryConfig
    );
  }

  private createSpeedTestError(
    message: string,
    code: string,
    details?: unknown,
    retryable = false
  ): SpeedTestError {
    return Object.assign(new Error(message), {
      name: 'SpeedTestError' as const,
      code,
      details,
      retryable,
    });
  }

  private async executeSpeedTest(
    config: SpeedTestConfig,
    timeoutMs?: number
  ): Promise<CloudflareResults> {
    return new Promise((resolve, reject) => {
      let speedTest: SpeedTest | null = null;
      try {
        speedTest = new SpeedTest(config);
        const effectiveTimeout = timeoutMs || this.config.timeouts.SPEED_TEST;
        let isCompleted = false;

        const timer = setTimeout(() => {
          if (isCompleted) return;
          isCompleted = true;
          // Attempt to stop the running test
          try {
            speedTest?.pause();
          } catch {
            // Ignore cleanup errors
          }
          speedTest = null;
          reject(new TimeoutError(effectiveTimeout));
        }, effectiveTimeout);
        // Don't let the timeout keep the process alive
        timer.unref();

        speedTest.onFinish = (results: CloudflareResults): void => {
          if (isCompleted) return;
          isCompleted = true;
          clearTimeout(timer);
          logger.debug('Speed test completed', {
            summary: results.getSummary(),
          });
          resolve(results);
        };

        speedTest.onError = (error: string): void => {
          if (isCompleted) return;
          isCompleted = true;
          clearTimeout(timer);
          logger.error('Speed test failed', { error });
          reject(
            this.createSpeedTestError(
              `Speed test execution failed: ${error}`,
              'SPEED_TEST_EXECUTION_ERROR',
              error,
              true
            )
          );
        };

        // If autoStart is false, we need to manually start the test
        if (config.autoStart === false) {
          speedTest.play();
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        reject(
          this.createSpeedTestError(
            `Failed to initialize speed test: ${err.message}`,
            'SPEED_TEST_INIT_ERROR',
            err,
            false
          )
        );
      }
    });
  }

  async runSpeedTest(
    options: SpeedTestOptions = {}
  ): Promise<CloudflareResults> {
    if (
      options.timeout !== undefined &&
      (typeof options.timeout !== 'number' || options.timeout <= 0)
    ) {
      throw this.createSpeedTestError(
        'Timeout must be a positive number',
        'INVALID_TIMEOUT_PARAMETER',
        { timeout: options.timeout },
        false
      );
    }

    logger.info('Starting speed test', { options });

    const config: SpeedTestConfig = {
      ...this.config.speedTestConfig,
    };

    if (options.type && options.type !== 'full') {
      config.measurements = this.getTestMeasurements(options.type);
    }

    try {
      const results = await this.executeSpeedTest(config, options.timeout);

      logger.info('Speed test completed successfully', {
        download: results.getDownloadBandwidth(),
        upload: results.getUploadBandwidth(),
        latency: results.getUnloadedLatency(),
      });

      return results;
    } catch (error) {
      if (error instanceof TimeoutError) {
        const effectiveTimeout =
          options.timeout || this.config.timeouts.SPEED_TEST;
        throw this.createSpeedTestError(
          `Speed test timed out after ${effectiveTimeout}ms`,
          'SPEED_TEST_TIMEOUT',
          error,
          true
        );
      }

      throw error;
    }
  }

  private getTestMeasurements(type: SpeedTestType): SpeedTestMeasurement[] {
    const baseMeasurements = [{ type: 'latency' as const, numPackets: 20 }];

    switch (type) {
      case 'latency':
        return baseMeasurements;
      case 'download':
        return [
          ...baseMeasurements,
          { type: 'download' as const, bytes: 1e6, count: 5 },
          { type: 'download' as const, bytes: 1e7, count: 3 },
        ];
      case 'upload':
        return [
          ...baseMeasurements,
          { type: 'upload' as const, bytes: 1e6, count: 5 },
          { type: 'upload' as const, bytes: 1e7, count: 3 },
        ];
      case 'packetLoss':
        return [
          ...baseMeasurements,
          {
            type: 'packetLoss' as const,
            numPackets: 1000,
            responsesWaitTime: 3000,
          },
        ];
      default:
        return this.config.speedTestConfig.measurements || [];
    }
  }

  async getConnectionInfo(): Promise<ConnectionInfo> {
    logger.info('Fetching connection info from Cloudflare trace API');

    try {
      const response = await this.httpClient.withTimeout(
        this.httpClient.fetch('https://1.1.1.1/cdn-cgi/trace'),
        this.config.timeouts.CONNECTION_INFO
      );

      if (!response.ok) {
        throw this.createSpeedTestError(
          `Connection info request failed: ${response.status} ${response.statusText}`,
          'CONNECTION_INFO_ERROR',
          { status: response.status, statusText: response.statusText },
          response.status >= 500
        );
      }

      const text = await response.text();
      return this.parseConnectionInfo(text);
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        error.name === 'SpeedTestError'
      ) {
        throw error;
      }

      const err = error instanceof Error ? error : new Error(String(error));
      throw this.createSpeedTestError(
        `Failed to get connection info: ${err.message}`,
        'CONNECTION_INFO_NETWORK_ERROR',
        err,
        true
      );
    }
  }

  private parseConnectionInfo(traceText: string): ConnectionInfo {
    const lines = traceText.split('\n');
    const data: Record<string, string> = {};

    for (const line of lines) {
      const eqIndex = line.indexOf('=');
      if (eqIndex === -1) continue;
      const key = line.slice(0, eqIndex).trim();
      const value = line.slice(eqIndex + 1).trim();
      if (key && value) {
        data[key] = value;
      }
    }

    logger.debug('Cloudflare trace API parsed', {
      fields: Object.keys(data),
    });

    return {
      ip: data.ip || 'unknown',
      isp: null,
      country: data.loc || 'unknown',
      region: null,
      city: null,
      timezone: null,
      raw: data,
    };
  }

  async discoverServers(): Promise<ServerLocation[]> {
    try {
      const response = await this.httpClient.withTimeout(
        this.httpClient.fetch('https://speed.cloudflare.com/locations'),
        this.config.timeouts.DEFAULT
      );

      if (!response.ok) {
        throw this.createSpeedTestError(
          `Server discovery failed: ${response.status} ${response.statusText}`,
          'SERVER_DISCOVERY_ERROR',
          { status: response.status, statusText: response.statusText },
          response.status >= 500
        );
      }

      const servers = await response.json();
      return this.parseServerLocations(servers);
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        error.name === 'SpeedTestError'
      ) {
        throw error;
      }

      const err = error instanceof Error ? error : new Error(String(error));
      throw this.createSpeedTestError(
        `Failed to discover servers: ${err.message}`,
        'SERVER_DISCOVERY_NETWORK_ERROR',
        err,
        true
      );
    }
  }

  private parseServerLocations(serversData: unknown): ServerLocation[] {
    if (!Array.isArray(serversData)) {
      return [];
    }

    return serversData
      .filter(
        (server) => server && typeof server === 'object' && server.iata
      )
      .map((server) => ({
        name: server.iata || server.name || 'unknown',
        location: `${server.city || 'unknown'}, ${server.region || 'unknown'}`,
        country: server.country || 'unknown',
        city: server.city || 'unknown',
        region: server.region || 'unknown',
        latitude: server.lat,
        longitude: server.lon,
        distance: server.distance,
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
