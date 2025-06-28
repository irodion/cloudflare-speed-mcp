import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { getRateLimitConfig, getBackoffConfig } from '../config/rate-limits.js';
import { OperationType } from '../types/rate-limit.js';

describe('Rate Limit Configuration', () => {
  let originalEnv: typeof process.env;
  let consoleWarnSpy: jest.SpiedFunction<typeof console.warn>;

  beforeEach(() => {
    originalEnv = { ...process.env };
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    consoleWarnSpy.mockRestore();
  });

  describe('getRateLimitConfig', () => {
    it('should use default values when environment variables are not set', () => {
      const config = getRateLimitConfig(OperationType.SPEED_TEST);
      
      expect(config.tokensPerInterval).toBe(1);
      expect(config.intervalMs).toBe(180000);
      expect(config.maxBucketSize).toBe(2);
      expect(config.maxDailyRequests).toBe(50);
      expect(config.maxConcurrentRequests).toBe(1);
    });

    it('should use environment variables when set to valid values', () => {
      process.env.RATE_LIMIT_SPEED_TEST_TOKENS_PER_INTERVAL = '5';
      process.env.RATE_LIMIT_SPEED_TEST_INTERVAL_MS = '300000';
      process.env.RATE_LIMIT_SPEED_TEST_MAX_BUCKET_SIZE = '10';
      process.env.RATE_LIMIT_SPEED_TEST_MAX_DAILY_REQUESTS = '100';
      process.env.RATE_LIMIT_SPEED_TEST_MAX_CONCURRENT_REQUESTS = '3';

      const config = getRateLimitConfig(OperationType.SPEED_TEST);
      
      expect(config.tokensPerInterval).toBe(5);
      expect(config.intervalMs).toBe(300000);
      expect(config.maxBucketSize).toBe(10);
      expect(config.maxDailyRequests).toBe(100);
      expect(config.maxConcurrentRequests).toBe(3);
    });

    it('should reject negative values and use defaults', () => {
      process.env.RATE_LIMIT_SPEED_TEST_TOKENS_PER_INTERVAL = '-1';
      process.env.RATE_LIMIT_SPEED_TEST_INTERVAL_MS = '-100';

      const config = getRateLimitConfig(OperationType.SPEED_TEST);
      
      expect(config.tokensPerInterval).toBe(1); // default
      expect(config.intervalMs).toBe(180000); // default
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('RATE_LIMIT_SPEED_TEST_TOKENS_PER_INTERVAL: -1 (negative value)')
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('RATE_LIMIT_SPEED_TEST_INTERVAL_MS: -100 (negative value)')
      );
    });

    it('should reject values exceeding maximum bounds and use defaults', () => {
      process.env.RATE_LIMIT_SPEED_TEST_TOKENS_PER_INTERVAL = '2000'; // Max is 1000
      process.env.RATE_LIMIT_SPEED_TEST_INTERVAL_MS = '86500000'; // Max is 24h = 86400000ms
      process.env.RATE_LIMIT_SPEED_TEST_MAX_BUCKET_SIZE = '20000'; // Max is 10000
      process.env.RATE_LIMIT_SPEED_TEST_MAX_DAILY_REQUESTS = '200000'; // Max is 100000
      process.env.RATE_LIMIT_SPEED_TEST_MAX_CONCURRENT_REQUESTS = '200'; // Max is 100

      const config = getRateLimitConfig(OperationType.SPEED_TEST);
      
      expect(config.tokensPerInterval).toBe(1); // default
      expect(config.intervalMs).toBe(180000); // default
      expect(config.maxBucketSize).toBe(2); // default
      expect(config.maxDailyRequests).toBe(50); // default
      expect(config.maxConcurrentRequests).toBe(1); // default

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('exceeds maximum allowed value')
      );
    });

    it('should reject non-numeric values and use defaults', () => {
      process.env.RATE_LIMIT_SPEED_TEST_TOKENS_PER_INTERVAL = 'invalid';
      process.env.RATE_LIMIT_SPEED_TEST_INTERVAL_MS = 'not-a-number';

      const config = getRateLimitConfig(OperationType.SPEED_TEST);
      
      expect(config.tokensPerInterval).toBe(1); // default
      expect(config.intervalMs).toBe(180000); // default
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('RATE_LIMIT_SPEED_TEST_TOKENS_PER_INTERVAL: invalid (not a number)')
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('RATE_LIMIT_SPEED_TEST_INTERVAL_MS: not-a-number (not a number)')
      );
    });
  });

  describe('getBackoffConfig', () => {
    it('should use default values when environment variables are not set', () => {
      const config = getBackoffConfig();
      
      expect(config.baseDelayMs).toBe(1000);
      expect(config.maxDelayMs).toBe(60000);
      expect(config.backoffMultiplier).toBe(2);
      expect(config.jitterFactor).toBe(0.1);
    });

    it('should use environment variables when set to valid values', () => {
      process.env.RATE_LIMIT_BACKOFF_BASE_DELAY_MS = '2000';
      process.env.RATE_LIMIT_BACKOFF_MAX_DELAY_MS = '120000';
      process.env.RATE_LIMIT_BACKOFF_MULTIPLIER = '3';
      process.env.RATE_LIMIT_BACKOFF_JITTER_FACTOR = '0.2';

      const config = getBackoffConfig();
      
      expect(config.baseDelayMs).toBe(2000);
      expect(config.maxDelayMs).toBe(120000);
      expect(config.backoffMultiplier).toBe(3);
      expect(config.jitterFactor).toBe(0.2);
    });

    it('should reject values exceeding maximum bounds and use defaults', () => {
      process.env.RATE_LIMIT_BACKOFF_BASE_DELAY_MS = '70000'; // Max is 60000
      process.env.RATE_LIMIT_BACKOFF_MAX_DELAY_MS = '700000'; // Max is 600000
      process.env.RATE_LIMIT_BACKOFF_MULTIPLIER = '15'; // Max is 10
      process.env.RATE_LIMIT_BACKOFF_JITTER_FACTOR = '2.0'; // Max is 1.0

      const config = getBackoffConfig();
      
      expect(config.baseDelayMs).toBe(1000); // default
      expect(config.maxDelayMs).toBe(60000); // default
      expect(config.backoffMultiplier).toBe(2); // default
      expect(config.jitterFactor).toBe(0.1); // default

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('exceeds maximum allowed value')
      );
    });

    it('should reject negative values and use defaults', () => {
      process.env.RATE_LIMIT_BACKOFF_BASE_DELAY_MS = '-1000';
      process.env.RATE_LIMIT_BACKOFF_JITTER_FACTOR = '-0.1';

      const config = getBackoffConfig();
      
      expect(config.baseDelayMs).toBe(1000); // default
      expect(config.jitterFactor).toBe(0.1); // default
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('negative value')
      );
    });
  });

  describe('Edge cases', () => {
    it('should handle boundary values correctly', () => {
      // Set values exactly at the maximum bounds
      process.env.RATE_LIMIT_SPEED_TEST_TOKENS_PER_INTERVAL = '1000'; // Exactly at max
      process.env.RATE_LIMIT_SPEED_TEST_INTERVAL_MS = '86400000'; // Exactly 24 hours
      process.env.RATE_LIMIT_BACKOFF_JITTER_FACTOR = '1.0'; // Exactly at max

      const rateLimitConfig = getRateLimitConfig(OperationType.SPEED_TEST);
      const backoffConfig = getBackoffConfig();
      
      expect(rateLimitConfig.tokensPerInterval).toBe(1000);
      expect(rateLimitConfig.intervalMs).toBe(86400000);
      expect(backoffConfig.jitterFactor).toBe(1.0);
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should handle zero values correctly', () => {
      process.env.RATE_LIMIT_SPEED_TEST_TOKENS_PER_INTERVAL = '0';
      process.env.RATE_LIMIT_BACKOFF_JITTER_FACTOR = '0';

      const rateLimitConfig = getRateLimitConfig(OperationType.SPEED_TEST);
      const backoffConfig = getBackoffConfig();
      
      expect(rateLimitConfig.tokensPerInterval).toBe(0);
      expect(backoffConfig.jitterFactor).toBe(0);
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });
  });
});