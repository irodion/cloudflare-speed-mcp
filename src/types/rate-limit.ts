export enum OperationType {
  SPEED_TEST = 'speed_test',
  PING = 'ping',
  TRACEROUTE = 'traceroute'
}

export interface RateLimitConfig {
  operationType: OperationType;
  tokensPerInterval: number;
  intervalMs: number;
  maxBucketSize: number;
  maxDailyRequests: number;
  maxConcurrentRequests: number;
  concurrentLimitWaitMs?: number;
}

export interface TokenBucketState {
  tokens: number;
  lastRefill: number;
  dailyRequestCount: number;
  dailyResetTime: number;
  concurrentRequests: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remainingTokens?: number;
  waitTimeMs?: number;
  dailyRequestsRemaining?: number;
  reason?: string;
}

export interface RateLimitStatus {
  operationType: OperationType;
  tokensRemaining: number;
  dailyRequestsRemaining: number;
  concurrentRequests: number;
  nextTokenRefillMs: number;
  dailyResetTimeMs: number;
}

export class RateLimitError extends Error {
  constructor(
    message: string,
    public readonly waitTimeMs: number,
    public readonly operationType: OperationType,
    public readonly reason: 'token_bucket' | 'daily_limit' | 'concurrent_limit'
  ) {
    super(message);
    this.name = 'RateLimitError';
  }
}

export interface RateLimitBackoffConfig {
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterFactor: number;
}

export interface BackoffState {
  consecutiveFailures: number;
  lastFailureTime: number;
}