export class TimeoutError extends Error {
  constructor(timeout: number) {
    super(`Operation timed out after ${timeout}ms`);
    this.name = 'TimeoutError';
  }
}

export class RetryError extends Error {
  constructor(attempts: number, lastError: Error) {
    super(
      `Failed after ${attempts} attempts. Last error: ${lastError.message}`
    );
    this.name = 'RetryError';
    this.cause = lastError;
  }
}

export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  exponentialBackoff: boolean;
  retryableErrors?: string[];
}

import { API_RETRY_CONFIG } from '../config/api.js';

export const DEFAULT_RETRY_CONFIG: RetryConfig = API_RETRY_CONFIG;

export class HttpClient {
  private timeout: number;
  private retryConfig: RetryConfig;

  constructor(timeout: number = 60000, retryConfig: Partial<RetryConfig> = {}) {
    this.timeout = timeout;
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };
  }

  async withTimeout<T>(promise: Promise<T>, timeoutMs?: number): Promise<T> {
    const timeout = timeoutMs || this.timeout;

    return Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new TimeoutError(timeout)), timeout);
      }),
    ]);
  }

  private isRetryableError(error: Error): boolean {
    if (!this.retryConfig.retryableErrors) return false;

    return this.retryConfig.retryableErrors.some(
      (code) =>
        error.message.includes(code) ||
        (error as { code?: string }).code === code
    );
  }

  private calculateDelay(attempt: number): number {
    if (!this.retryConfig.exponentialBackoff) {
      return this.retryConfig.baseDelayMs;
    }

    const delay = this.retryConfig.baseDelayMs * Math.pow(2, attempt - 1);
    return Math.min(delay, this.retryConfig.maxDelayMs);
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error = new Error('Unknown error');

    for (let attempt = 1; attempt <= this.retryConfig.maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (
          attempt === this.retryConfig.maxAttempts ||
          !this.isRetryableError(lastError)
        ) {
          break;
        }

        const delay = this.calculateDelay(attempt);
        await this.sleep(delay);
      }
    }

    throw new RetryError(this.retryConfig.maxAttempts, lastError);
  }

  async fetch(
    url: string,
    options: globalThis.RequestInit = {}
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await this.withRetry(async () => {
        return fetch(url, {
          ...options,
          signal: controller.signal,
        });
      });

      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        throw new TimeoutError(this.timeout);
      }

      throw error;
    }
  }
}
