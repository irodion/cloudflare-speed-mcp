import {
  OperationType,
  RateLimitConfig,
  TokenBucketState,
  RateLimitResult,
  RateLimitStatus,
  RateLimitError,
  RateLimitBackoffConfig,
  BackoffState,
} from '../types/rate-limit.js';
import { getRateLimitConfig, getBackoffConfig } from '../config/rate-limits.js';
import {
  getCurrentTimestamp,
  getNextDayStart,
  calculateWaitTime,
  calculateTokensToAdd,
  calculateBackoffDelay,
  formatDuration,
} from '../utils/time.js';

export class RateLimiter {
  private readonly configs: Map<OperationType, RateLimitConfig> = new Map();
  private readonly states: Map<OperationType, TokenBucketState> = new Map();
  private readonly backoffStates: Map<OperationType, BackoffState> = new Map();
  private readonly backoffConfig: RateLimitBackoffConfig;

  constructor() {
    this.backoffConfig = getBackoffConfig();
    this.initializeConfigs();
  }

  private initializeConfigs(): void {
    for (const operationType of Object.values(OperationType)) {
      const config = getRateLimitConfig(operationType);
      this.configs.set(operationType, config);
      this.initializeState(operationType, config);
    }
  }

  private initializeState(
    operationType: OperationType,
    config: RateLimitConfig
  ): void {
    const now = getCurrentTimestamp();
    this.states.set(operationType, {
      tokens: config.maxBucketSize,
      lastRefill: now,
      dailyRequestCount: 0,
      dailyResetTime: getNextDayStart(now),
      concurrentRequests: 0,
    });
    this.backoffStates.set(operationType, {
      consecutiveFailures: 0,
      lastFailureTime: 0,
    });
  }

  public checkRateLimit(operationType: OperationType): RateLimitResult {
    const config = this.configs.get(operationType);
    const state = this.states.get(operationType);

    if (!config || !state) {
      throw new RateLimitError(
        `Unknown operation type: ${operationType}`,
        0,
        operationType,
        'token_bucket'
      );
    }

    this.refillTokens(operationType);
    this.resetDailyCountIfNeeded(operationType);

    const concurrentCheck = this.checkConcurrentLimit(operationType);
    if (!concurrentCheck.allowed) {
      return concurrentCheck;
    }

    const dailyCheck = this.checkDailyLimit(operationType);
    if (!dailyCheck.allowed) {
      return dailyCheck;
    }

    const tokenCheck = this.checkTokenBucket(operationType);
    if (!tokenCheck.allowed) {
      return tokenCheck;
    }

    this.consumeToken(operationType);
    this.resetBackoffState(operationType);

    return {
      allowed: true,
      remainingTokens: state.tokens,
      dailyRequestsRemaining: config.maxDailyRequests - state.dailyRequestCount,
    };
  }

  public acquirePermission(operationType: OperationType): void {
    const result = this.checkRateLimit(operationType);

    if (!result.allowed) {
      this.recordFailure(operationType);
      const backoffDelay = this.calculateCurrentBackoffDelay(operationType);
      const totalWaitTime = Math.max(result.waitTimeMs || 0, backoffDelay);

      throw new RateLimitError(
        `Rate limit exceeded for ${operationType}. ${result.reason}. Wait ${formatDuration(totalWaitTime)}.`,
        totalWaitTime,
        operationType,
        this.mapReasonToLimitType(result.reason || '')
      );
    }

    this.incrementConcurrentRequests(operationType);
  }

  public releasePermission(operationType: OperationType): void {
    const state = this.states.get(operationType);
    if (state && state.concurrentRequests > 0) {
      state.concurrentRequests--;
    }
  }

  public getStatus(operationType: OperationType): RateLimitStatus {
    const config = this.configs.get(operationType);
    const state = this.states.get(operationType);

    if (!config || !state) {
      throw new RateLimitError(
        `Unknown operation type: ${operationType}`,
        0,
        operationType,
        'token_bucket'
      );
    }

    this.refillTokens(operationType);
    this.resetDailyCountIfNeeded(operationType);

    const nextTokenRefillMs = calculateWaitTime(
      state.lastRefill,
      config.intervalMs,
      1,
      config.tokensPerInterval
    );

    return {
      operationType,
      tokensRemaining: state.tokens,
      dailyRequestsRemaining: config.maxDailyRequests - state.dailyRequestCount,
      concurrentRequests: state.concurrentRequests,
      nextTokenRefillMs,
      dailyResetTimeMs: state.dailyResetTime - getCurrentTimestamp(),
    };
  }

  public reset(operationType?: OperationType): void {
    if (operationType) {
      const config = this.configs.get(operationType);
      if (config) {
        this.initializeState(operationType, config);
      }
    } else {
      for (const [type, config] of this.configs) {
        this.initializeState(type, config);
      }
    }
  }

  private refillTokens(operationType: OperationType): void {
    const config = this.configs.get(operationType);
    const state = this.states.get(operationType);

    if (!config || !state) {
      throw new RateLimitError(
        `Invalid state for operation type: ${operationType}`,
        0,
        operationType,
        'token_bucket'
      );
    }

    const { tokensToAdd, newLastRefill } = calculateTokensToAdd(
      state.lastRefill,
      config.tokensPerInterval,
      config.intervalMs,
      config.maxBucketSize,
      state.tokens
    );

    if (tokensToAdd > 0) {
      state.tokens = Math.min(state.tokens + tokensToAdd, config.maxBucketSize);
      state.lastRefill = newLastRefill;
    }
  }

  private resetDailyCountIfNeeded(operationType: OperationType): void {
    const state = this.states.get(operationType);
    if (!state) {
      throw new RateLimitError(
        `Invalid state for operation type: ${operationType}`,
        0,
        operationType,
        'token_bucket'
      );
    }
    const now = getCurrentTimestamp();

    if (now >= state.dailyResetTime) {
      state.dailyRequestCount = 0;
      state.dailyResetTime = getNextDayStart(now);
    }
  }

  private checkConcurrentLimit(operationType: OperationType): RateLimitResult {
    const config = this.configs.get(operationType);
    const state = this.states.get(operationType);

    if (!config || !state) {
      throw new RateLimitError(
        `Invalid state for operation type: ${operationType}`,
        0,
        operationType,
        'concurrent_limit'
      );
    }

    if (state.concurrentRequests >= config.maxConcurrentRequests) {
      return {
        allowed: false,
        waitTimeMs: config.concurrentLimitWaitMs || 1000, // Configurable or default wait time
        reason: `Maximum concurrent requests (${config.maxConcurrentRequests}) exceeded`,
      };
    }

    return { allowed: true };
  }

  private checkDailyLimit(operationType: OperationType): RateLimitResult {
    const config = this.configs.get(operationType);
    const state = this.states.get(operationType);

    if (!config || !state) {
      throw new RateLimitError(
        `Invalid state for operation type: ${operationType}`,
        0,
        operationType,
        'daily_limit'
      );
    }

    if (state.dailyRequestCount >= config.maxDailyRequests) {
      const waitTimeMs = state.dailyResetTime - getCurrentTimestamp();
      return {
        allowed: false,
        waitTimeMs,
        dailyRequestsRemaining: 0,
        reason: `Daily limit (${config.maxDailyRequests}) exceeded`,
      };
    }

    return { allowed: true };
  }

  private checkTokenBucket(operationType: OperationType): RateLimitResult {
    const config = this.configs.get(operationType);
    const state = this.states.get(operationType);

    if (!config || !state) {
      throw new RateLimitError(
        `Invalid state for operation type: ${operationType}`,
        0,
        operationType,
        'token_bucket'
      );
    }

    if (state.tokens < 1) {
      const waitTimeMs = calculateWaitTime(
        state.lastRefill,
        config.intervalMs,
        1,
        config.tokensPerInterval
      );

      return {
        allowed: false,
        remainingTokens: 0,
        waitTimeMs,
        reason: 'Token bucket depleted',
      };
    }

    return { allowed: true };
  }

  private consumeToken(operationType: OperationType): void {
    const state = this.states.get(operationType);
    if (!state) {
      throw new RateLimitError(
        `Invalid state for operation type: ${operationType}`,
        0,
        operationType,
        'token_bucket'
      );
    }
    state.tokens = Math.max(0, state.tokens - 1);
    state.dailyRequestCount++;
  }

  private incrementConcurrentRequests(operationType: OperationType): void {
    const state = this.states.get(operationType);
    if (!state) {
      throw new RateLimitError(
        `Invalid state for operation type: ${operationType}`,
        0,
        operationType,
        'concurrent_limit'
      );
    }
    state.concurrentRequests++;
  }

  private recordFailure(operationType: OperationType): void {
    const backoffState = this.backoffStates.get(operationType);
    if (!backoffState) {
      throw new RateLimitError(
        `Invalid backoff state for operation type: ${operationType}`,
        0,
        operationType,
        'token_bucket'
      );
    }
    backoffState.consecutiveFailures++;
    backoffState.lastFailureTime = getCurrentTimestamp();
  }

  private resetBackoffState(operationType: OperationType): void {
    const backoffState = this.backoffStates.get(operationType);
    if (!backoffState) {
      throw new RateLimitError(
        `Invalid backoff state for operation type: ${operationType}`,
        0,
        operationType,
        'token_bucket'
      );
    }
    backoffState.consecutiveFailures = 0;
    backoffState.lastFailureTime = 0;
  }

  private calculateCurrentBackoffDelay(operationType: OperationType): number {
    const backoffState = this.backoffStates.get(operationType);
    if (!backoffState) {
      throw new RateLimitError(
        `Invalid backoff state for operation type: ${operationType}`,
        0,
        operationType,
        'token_bucket'
      );
    }

    if (backoffState.consecutiveFailures === 0) {
      return 0;
    }

    return calculateBackoffDelay(
      backoffState.consecutiveFailures,
      this.backoffConfig.baseDelayMs,
      this.backoffConfig.maxDelayMs,
      this.backoffConfig.backoffMultiplier,
      this.backoffConfig.jitterFactor
    );
  }

  private mapReasonToLimitType(
    reason: string
  ): 'token_bucket' | 'daily_limit' | 'concurrent_limit' {
    const lowerReason = reason.toLowerCase();

    if (
      lowerReason.includes('concurrent') ||
      lowerReason.includes('maximum concurrent')
    ) {
      return 'concurrent_limit';
    }

    if (lowerReason.includes('daily') || lowerReason.includes('daily limit')) {
      return 'daily_limit';
    }

    // Default to token_bucket for bucket-related reasons or unknown reasons
    return 'token_bucket';
  }
}
