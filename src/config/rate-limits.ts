import { OperationType, RateLimitConfig, RateLimitBackoffConfig } from '../types/rate-limit.js';

export const DEFAULT_RATE_LIMITS: Record<OperationType, RateLimitConfig> = {
  [OperationType.SPEED_TEST]: {
    operationType: OperationType.SPEED_TEST,
    tokensPerInterval: 1,
    intervalMs: 180_000, // 3 minutes
    maxBucketSize: 2,
    maxDailyRequests: 50,
    maxConcurrentRequests: 1,
  },
  [OperationType.PING]: {
    operationType: OperationType.PING,
    tokensPerInterval: 10,
    intervalMs: 60_000, // 1 minute
    maxBucketSize: 20,
    maxDailyRequests: 1000,
    maxConcurrentRequests: 5,
  },
  [OperationType.TRACEROUTE]: {
    operationType: OperationType.TRACEROUTE,
    tokensPerInterval: 5,
    intervalMs: 60_000, // 1 minute
    maxBucketSize: 10,
    maxDailyRequests: 500,
    maxConcurrentRequests: 3,
  },
  [OperationType.LATENCY_TEST]: {
    operationType: OperationType.LATENCY_TEST,
    tokensPerInterval: 10,
    intervalMs: 60_000, // 1 minute
    maxBucketSize: 15,
    maxDailyRequests: 500,
    maxConcurrentRequests: 3,
  },
  [OperationType.DOWNLOAD_TEST]: {
    operationType: OperationType.DOWNLOAD_TEST,
    tokensPerInterval: 2,
    intervalMs: 120_000, // 2 minutes
    maxBucketSize: 3,
    maxDailyRequests: 100,
    maxConcurrentRequests: 2,
  },
  [OperationType.UPLOAD_TEST]: {
    operationType: OperationType.UPLOAD_TEST,
    tokensPerInterval: 2,
    intervalMs: 120_000, // 2 minutes
    maxBucketSize: 3,
    maxDailyRequests: 100,
    maxConcurrentRequests: 2,
  },
  [OperationType.PACKET_LOSS_TEST]: {
    operationType: OperationType.PACKET_LOSS_TEST,
    tokensPerInterval: 5,
    intervalMs: 90_000, // 1.5 minutes
    maxBucketSize: 8,
    maxDailyRequests: 200,
    maxConcurrentRequests: 2,
  },
  [OperationType.CONNECTION_INFO]: {
    operationType: OperationType.CONNECTION_INFO,
    tokensPerInterval: 20,
    intervalMs: 60_000, // 1 minute
    maxBucketSize: 30,
    maxDailyRequests: 1000,
    maxConcurrentRequests: 5,
  },
};

export const DEFAULT_BACKOFF_CONFIG: RateLimitBackoffConfig = {
  baseDelayMs: 1000,
  maxDelayMs: 60_000,
  backoffMultiplier: 2,
  jitterFactor: 0.1,
};

export function getRateLimitConfig(operationType: OperationType): RateLimitConfig {
  const envPrefix = `RATE_LIMIT_${camelToScreamingSnakeCase(operationType)}`;
  const defaultConfig = DEFAULT_RATE_LIMITS[operationType];

  return {
    operationType,
    tokensPerInterval: getEnvInteger(
      `${envPrefix}_TOKENS_PER_INTERVAL`,
      defaultConfig.tokensPerInterval,
      1000 // Max 1000 tokens per interval
    ),
    intervalMs: getEnvInteger(
      `${envPrefix}_INTERVAL_MS`,
      defaultConfig.intervalMs,
      24 * 60 * 60 * 1000 // Max 24 hours
    ),
    maxBucketSize: getEnvInteger(
      `${envPrefix}_MAX_BUCKET_SIZE`,
      defaultConfig.maxBucketSize,
      10000 // Max 10000 tokens in bucket
    ),
    maxDailyRequests: getEnvInteger(
      `${envPrefix}_MAX_DAILY_REQUESTS`,
      defaultConfig.maxDailyRequests,
      100000 // Max 100k requests per day
    ),
    maxConcurrentRequests: getEnvInteger(
      `${envPrefix}_MAX_CONCURRENT_REQUESTS`,
      defaultConfig.maxConcurrentRequests,
      100 // Max 100 concurrent requests
    ),
  };
}

export function getBackoffConfig(): RateLimitBackoffConfig {
  return {
    baseDelayMs: getEnvInteger(
      'RATE_LIMIT_BACKOFF_BASE_DELAY_MS', 
      DEFAULT_BACKOFF_CONFIG.baseDelayMs,
      60000 // Max 60 seconds base delay
    ),
    maxDelayMs: getEnvInteger(
      'RATE_LIMIT_BACKOFF_MAX_DELAY_MS', 
      DEFAULT_BACKOFF_CONFIG.maxDelayMs,
      600000 // Max 10 minutes
    ),
    backoffMultiplier: getEnvNumber(
      'RATE_LIMIT_BACKOFF_MULTIPLIER', 
      DEFAULT_BACKOFF_CONFIG.backoffMultiplier,
      10 // Max 10x multiplier
    ),
    jitterFactor: getEnvNumber(
      'RATE_LIMIT_BACKOFF_JITTER_FACTOR', 
      DEFAULT_BACKOFF_CONFIG.jitterFactor,
      1.0 // Max 100% jitter
    ),
  };
}

function parseEnvValue<T>(
  envVar: string,
  defaultValue: T,
  parser: (value: string) => T,
  maxValue?: T
): T {
  const value = process.env[envVar];
  if (value === undefined) {
    return defaultValue;
  }

  const parsed = parser(value);
  const numValue = parsed as number;
  
  if (isNaN(numValue)) {
    console.warn(`${envVar}: ${value} (not a number)`);
    return defaultValue;
  }
  
  if (numValue < 0) {
    console.warn(`${envVar}: ${value} (negative value)`);
    return defaultValue;
  }
  
  if (maxValue !== undefined && numValue > (maxValue as number)) {
    console.warn(`${envVar}: ${value} (exceeds maximum allowed value)`);
    return defaultValue;
  }

  return parsed;
}

function getEnvInteger(envVar: string, defaultValue: number, maxValue?: number): number {
  return parseEnvValue(envVar, defaultValue, (v) => parseInt(v, 10), maxValue);
}

function getEnvNumber(envVar: string, defaultValue: number, maxValue?: number): number {
  return parseEnvValue(envVar, defaultValue, parseFloat, maxValue);
}

function camelToScreamingSnakeCase(str: string): string {
  return str.replace(/([A-Z])/g, '_$1').toUpperCase();
}
