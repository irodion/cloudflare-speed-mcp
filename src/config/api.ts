import { SpeedTestConfig, SpeedTestMeasurement } from '../types/speedtest.js';
import { RetryConfig } from '../utils/http.js';

export const API_TIMEOUTS = {
  DEFAULT: 60000,
  SPEED_TEST: 120000,
  CONNECTION_INFO: 30000,
} as const;

export const DEFAULT_MEASUREMENTS: SpeedTestMeasurement[] = [
  { type: 'latency', numPackets: 1 },
  { type: 'download', bytes: 1e5, count: 1, bypassMinDuration: true },
  { type: 'latency', numPackets: 20 },
  { type: 'download', bytes: 1e5, count: 9 },
  { type: 'download', bytes: 1e6, count: 8 },
  { type: 'upload', bytes: 1e5, count: 8 },
  { type: 'packetLoss', numPackets: 1e3, responsesWaitTime: 3000 },
  { type: 'upload', bytes: 1e6, count: 6 },
  { type: 'download', bytes: 1e7, count: 6 },
  { type: 'upload', bytes: 1e7, count: 4 },
  { type: 'download', bytes: 2.5e7, count: 4 },
  { type: 'upload', bytes: 2.5e7, count: 4 },
  { type: 'download', bytes: 1e8, count: 3 },
  { type: 'upload', bytes: 5e7, count: 3 },
  { type: 'download', bytes: 2.5e8, count: 2 },
];

export const DEFAULT_SPEED_TEST_CONFIG: SpeedTestConfig = {
  measurements: DEFAULT_MEASUREMENTS,
  autoStart: false,
};

export const API_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  exponentialBackoff: true,
  retryableErrors: [
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    'ECONNREFUSED',
    'NETWORK_ERROR',
    'TIMEOUT_ERROR',
  ],
};

export const RATE_LIMITS = {
  REQUESTS_PER_MINUTE: 10,
  SPEED_TESTS_PER_HOUR: 5,
  BURST_LIMIT: 3,
} as const;

export interface ApiConfig {
  timeouts: typeof API_TIMEOUTS;
  retryConfig: RetryConfig;
  speedTestConfig: SpeedTestConfig;
  rateLimits: typeof RATE_LIMITS;
  userAgent: string;
}

export function createApiConfig(overrides: Partial<ApiConfig> = {}): ApiConfig {
  return {
    timeouts: { ...API_TIMEOUTS, ...overrides.timeouts },
    retryConfig: { ...API_RETRY_CONFIG, ...overrides.retryConfig },
    speedTestConfig: {
      ...DEFAULT_SPEED_TEST_CONFIG,
      ...overrides.speedTestConfig,
    },
    rateLimits: { ...RATE_LIMITS, ...overrides.rateLimits },
    userAgent: overrides.userAgent || 'speed-cloudflare-mcp/1.0.0',
  };
}
