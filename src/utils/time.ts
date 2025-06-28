export function getCurrentTimestamp(): number {
  return Date.now();
}

export function getStartOfDay(timestamp: number = getCurrentTimestamp()): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function getNextDayStart(timestamp: number = getCurrentTimestamp()): number {
  const startOfDay = getStartOfDay(timestamp);
  return startOfDay + 24 * 60 * 60 * 1000; // Add 24 hours
}

export function calculateWaitTime(
  lastRefill: number,
  intervalMs: number,
  tokensNeeded: number = 1,
  tokensPerInterval: number = 1
): number {
  const now = getCurrentTimestamp();
  const timeSinceLastRefill = now - lastRefill;
  const timeToNextToken = intervalMs - (timeSinceLastRefill % intervalMs);
  
  if (tokensNeeded === 1) {
    return timeToNextToken;
  }
  
  const additionalTokensNeeded = tokensNeeded - 1;
  const additionalTime = additionalTokensNeeded * (intervalMs / tokensPerInterval);
  
  return timeToNextToken + additionalTime;
}

export function calculateTokensToAdd(
  lastRefill: number,
  tokensPerInterval: number,
  intervalMs: number,
  maxBucketSize: number,
  currentTokens: number
): { tokensToAdd: number; newLastRefill: number } {
  const now = getCurrentTimestamp();
  const timeSinceLastRefill = now - lastRefill;
  
  if (timeSinceLastRefill < intervalMs) {
    return { tokensToAdd: 0, newLastRefill: lastRefill };
  }
  
  const intervalsElapsed = Math.floor(timeSinceLastRefill / intervalMs);
  const tokensToAdd = Math.min(
    intervalsElapsed * tokensPerInterval,
    maxBucketSize - currentTokens
  );
  
  const newLastRefill = lastRefill + (intervalsElapsed * intervalMs);
  
  return { tokensToAdd, newLastRefill };
}

export function calculateBackoffDelay(
  consecutiveFailures: number,
  baseDelayMs: number,
  maxDelayMs: number,
  backoffMultiplier: number,
  jitterFactor: number
): number {
  const exponentialDelay = baseDelayMs * Math.pow(backoffMultiplier, consecutiveFailures);
  const cappedDelay = Math.min(exponentialDelay, maxDelayMs);
  
  const jitter = cappedDelay * jitterFactor * (Math.random() - 0.5);
  
  return Math.max(0, cappedDelay + jitter);
}

export function formatDuration(milliseconds: number): string {
  if (milliseconds < 1000) {
    return `${Math.round(milliseconds)}ms`;
  }
  
  const seconds = Math.floor(milliseconds / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  if (minutes < 60) {
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }
  
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}