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
};

export const DEFAULT_BACKOFF_CONFIG: RateLimitBackoffConfig = {
  baseDelayMs: 1000,
  maxDelayMs: 60_000,
  backoffMultiplier: 2,
  jitterFactor: 0.1,
};

export function getRateLimitConfig(operationType: OperationType): RateLimitConfig {
  const envPrefix = `RATE_LIMIT_${operationType.toUpperCase()}`;
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
      10 * 60 * 1000 // Max 10 minutes
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
  if (isNaN(parsed as number) || (parsed as number) < 0 || (maxValue !== undefined && (parsed as number) > (maxValue as number))) {
    const reason = isNaN(parsed as number) ? 'not a number' :
                   (parsed as number) < 0 ? 'negative value' :
                   'exceeds maximum allowed value';
    console.warn(`Invalid value for ${envVar}: ${value} (${reason}). Using default: ${defaultValue}`);
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
