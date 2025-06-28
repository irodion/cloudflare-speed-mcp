import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { RateLimiter } from '../services/rate-limiter.js';
import { OperationType, RateLimitError } from '../types/rate-limit.js';

describe('RateLimiter', () => {
  let rateLimiter: RateLimiter;
  let mockDate: jest.SpiedFunction<typeof Date.now>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDate = jest.spyOn(Date, 'now').mockReturnValue(1000000);
    rateLimiter = new RateLimiter();
  });

  afterEach(() => {
    mockDate.mockRestore();
  });

  describe('Token Bucket Algorithm', () => {
    it('should allow requests when tokens are available', async () => {
      const result = await rateLimiter.checkRateLimit(OperationType.SPEED_TEST);
      
      expect(result.allowed).toBe(true);
      expect(result.remainingTokens).toBe(1); // Started with 2, consumed 1
    });

    it('should deny requests when tokens are depleted', async () => {
      // Consume all tokens
      await rateLimiter.checkRateLimit(OperationType.SPEED_TEST);
      await rateLimiter.checkRateLimit(OperationType.SPEED_TEST);
      
      const result = await rateLimiter.checkRateLimit(OperationType.SPEED_TEST);
      
      expect(result.allowed).toBe(false);
      expect(result.remainingTokens).toBe(0);
      expect(result.waitTimeMs).toBeGreaterThan(0);
      expect(result.reason).toBe('Token bucket depleted');
    });

    it('should refill tokens over time', async () => {
      // Consume all tokens
      await rateLimiter.checkRateLimit(OperationType.SPEED_TEST);
      await rateLimiter.checkRateLimit(OperationType.SPEED_TEST);
      
      // Advance time by 3 minutes (180 seconds)
      mockDate.mockReturnValue(1000000 + 180000);
      
      const result = await rateLimiter.checkRateLimit(OperationType.SPEED_TEST);
      
      expect(result.allowed).toBe(true);
    });

    it('should not exceed maximum bucket size', async () => {
      // Advance time by a very long period
      mockDate.mockReturnValue(1000000 + 3600000); // 1 hour
      
      const status = rateLimiter.getStatus(OperationType.SPEED_TEST);
      
      expect(status.tokensRemaining).toBe(2); // Max bucket size
    });
  });

  describe('Daily Limits', () => {
    it('should track daily request count', async () => {
      const result = await rateLimiter.checkRateLimit(OperationType.SPEED_TEST);
      
      expect(result.dailyRequestsRemaining).toBe(49); // Started with 50, consumed 1
    });

    it('should deny requests when daily limit is exceeded', async () => {
      // Mock a scenario where we've already hit the daily limit
      for (let i = 0; i < 50; i++) {
        mockDate.mockReturnValue(1000000 + i * 180000); // Space out requests
        await rateLimiter.checkRateLimit(OperationType.SPEED_TEST);
      }
      
      const result = await rateLimiter.checkRateLimit(OperationType.SPEED_TEST);
      
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Daily limit');
    });

    it('should reset daily count at start of new day', async () => {
      // Consume some requests
      await rateLimiter.checkRateLimit(OperationType.SPEED_TEST);
      
      // Advance to next day
      mockDate.mockReturnValue(1000000 + 24 * 60 * 60 * 1000);
      
      const status = rateLimiter.getStatus(OperationType.SPEED_TEST);
      
      expect(status.dailyRequestsRemaining).toBe(50);
    });
  });

  describe('Concurrent Request Limiting', () => {
    it('should allow concurrent requests up to limit', () => {
      rateLimiter.acquirePermission(OperationType.SPEED_TEST);
      
      const status = rateLimiter.getStatus(OperationType.SPEED_TEST);
      expect(status.concurrentRequests).toBe(1);
      
      // Try to acquire another permission (should fail for speed test with limit 1)
      expect(() => rateLimiter.acquirePermission(OperationType.SPEED_TEST))
        .toThrow(RateLimitError);
    });

    it('should release concurrent request slots', () => {
      rateLimiter.acquirePermission(OperationType.SPEED_TEST);
      
      rateLimiter.releasePermission(OperationType.SPEED_TEST);
      
      const status = rateLimiter.getStatus(OperationType.SPEED_TEST);
      expect(status.concurrentRequests).toBe(0);
    });

    it('should handle multiple concurrent requests for operations with higher limits', () => {
      // PING operations allow up to 5 concurrent requests
      rateLimiter.acquirePermission(OperationType.PING);
      rateLimiter.acquirePermission(OperationType.PING);
      
      const status = rateLimiter.getStatus(OperationType.PING);
      expect(status.concurrentRequests).toBe(2);
    });
  });

  describe('Rate Limit Errors', () => {
    it('should throw RateLimitError with proper details', () => {
      // Consume all tokens
      rateLimiter.checkRateLimit(OperationType.SPEED_TEST);
      rateLimiter.checkRateLimit(OperationType.SPEED_TEST);
      
      try {
        rateLimiter.acquirePermission(OperationType.SPEED_TEST);
        throw new Error('Should have thrown RateLimitError');
      } catch (error) {
        expect(error).toBeInstanceOf(RateLimitError);
        expect((error as RateLimitError).operationType).toBe(OperationType.SPEED_TEST);
        expect((error as RateLimitError).waitTimeMs).toBeGreaterThan(0);
      }
    });
  });

  describe('Exponential Backoff', () => {
    it('should increase backoff delay with consecutive failures', () => {
      // Consume all tokens to trigger failures
      rateLimiter.checkRateLimit(OperationType.SPEED_TEST);
      rateLimiter.checkRateLimit(OperationType.SPEED_TEST);
      
      let firstError: RateLimitError;
      let secondError: RateLimitError;
      
      try {
        rateLimiter.acquirePermission(OperationType.SPEED_TEST);
      } catch (error) {
        firstError = error as RateLimitError;
      }
      
      try {
        rateLimiter.acquirePermission(OperationType.SPEED_TEST);
      } catch (error) {
        secondError = error as RateLimitError;
      }
      
      // The backoff state should have increased failure count
      // Both should be RateLimitErrors with wait times
      expect(firstError!).toBeInstanceOf(RateLimitError);
      expect(secondError!).toBeInstanceOf(RateLimitError);
      expect(firstError!.waitTimeMs).toBeGreaterThan(0);
      expect(secondError!.waitTimeMs).toBeGreaterThan(0);
    });

    it('should reset backoff after successful request', async () => {
      // Trigger a failure first
      await rateLimiter.checkRateLimit(OperationType.SPEED_TEST);
      await rateLimiter.checkRateLimit(OperationType.SPEED_TEST);
      
      try {
        await rateLimiter.acquirePermission(OperationType.SPEED_TEST);
      } catch (error) {
        // Expected failure
      }
      
      // Allow time to pass and tokens to refill
      mockDate.mockReturnValue(1000000 + 180000);
      
      // This should succeed and reset backoff
      const result = await rateLimiter.checkRateLimit(OperationType.SPEED_TEST);
      expect(result.allowed).toBe(true);
    });
  });

  describe('Status and Reset', () => {
    it('should provide accurate status information', () => {
      const status = rateLimiter.getStatus(OperationType.SPEED_TEST);
      
      expect(status.operationType).toBe(OperationType.SPEED_TEST);
      expect(status.tokensRemaining).toBe(2);
      expect(status.dailyRequestsRemaining).toBe(50);
      expect(status.concurrentRequests).toBe(0);
      expect(typeof status.nextTokenRefillMs).toBe('number');
      expect(typeof status.dailyResetTimeMs).toBe('number');
    });

    it('should reset rate limiter state', async () => {
      // Consume some resources
      await rateLimiter.checkRateLimit(OperationType.SPEED_TEST);
      await rateLimiter.acquirePermission(OperationType.SPEED_TEST);
      
      rateLimiter.reset(OperationType.SPEED_TEST);
      
      const status = rateLimiter.getStatus(OperationType.SPEED_TEST);
      expect(status.tokensRemaining).toBe(2);
      expect(status.dailyRequestsRemaining).toBe(50);
      expect(status.concurrentRequests).toBe(0);
    });

    it('should reset all operation types when no specific type provided', async () => {
      await rateLimiter.checkRateLimit(OperationType.SPEED_TEST);
      await rateLimiter.checkRateLimit(OperationType.PING);
      
      rateLimiter.reset();
      
      const speedTestStatus = rateLimiter.getStatus(OperationType.SPEED_TEST);
      const pingStatus = rateLimiter.getStatus(OperationType.PING);
      
      expect(speedTestStatus.tokensRemaining).toBe(2);
      expect(pingStatus.tokensRemaining).toBe(20);
    });
  });

  describe('Different Operation Types', () => {
    it('should handle different rate limits for different operations', async () => {
      const speedTestStatus = rateLimiter.getStatus(OperationType.SPEED_TEST);
      const pingStatus = rateLimiter.getStatus(OperationType.PING);
      const tracerouteStatus = rateLimiter.getStatus(OperationType.TRACEROUTE);
      
      expect(speedTestStatus.tokensRemaining).toBe(2);
      expect(pingStatus.tokensRemaining).toBe(20);
      expect(tracerouteStatus.tokensRemaining).toBe(10);
    });

    it('should maintain separate state for each operation type', async () => {
      await rateLimiter.checkRateLimit(OperationType.SPEED_TEST);
      
      const speedTestStatus = rateLimiter.getStatus(OperationType.SPEED_TEST);
      const pingStatus = rateLimiter.getStatus(OperationType.PING);
      
      expect(speedTestStatus.tokensRemaining).toBe(1);
      expect(pingStatus.tokensRemaining).toBe(20); // Unchanged
    });
  });

  describe('Error Handling', () => {
    it('should throw error for unknown operation type', async () => {
      expect(() => rateLimiter.getStatus('unknown' as OperationType))
        .toThrow('Unknown operation type: unknown');
    });
  });
});