---
title: Retry Logic
description: Implement automatic retry for flaky requests
---

Handle transient failures with automatic retry logic.

## Basic Retry

```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delay = 1000
): Promise<T> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === retries - 1) throw error;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error('Unreachable');
}

// Usage
const response = await withRetry(() =>
  client.run('./api/flaky-endpoint.http')
);
```

## Exponential Backoff

Increase delay between retries:

```typescript
async function withExponentialBackoff<T>(
  fn: () => Promise<T>,
  options: {
    retries?: number;
    initialDelay?: number;
    maxDelay?: number;
    backoffFactor?: number;
  } = {}
): Promise<T> {
  const {
    retries = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    backoffFactor = 2,
  } = options;

  let delay = initialDelay;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === retries - 1) throw error;

      console.log(`Attempt ${attempt + 1} failed, retrying in ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));

      delay = Math.min(delay * backoffFactor, maxDelay);
    }
  }
  throw new Error('Unreachable');
}

// Usage
const response = await withExponentialBackoff(
  () => client.run('./api/rate-limited.http'),
  { retries: 5, initialDelay: 1000, maxDelay: 60000 }
);
```

## Retry on Specific Status Codes

Only retry for certain HTTP errors:

```typescript
async function withRetryOnStatus<T extends Response>(
  fn: () => Promise<T>,
  options: {
    retryStatuses?: number[];
    retries?: number;
    delay?: number;
  } = {}
): Promise<T> {
  const {
    retryStatuses = [429, 500, 502, 503, 504],
    retries = 3,
    delay = 1000,
  } = options;

  for (let attempt = 0; attempt < retries; attempt++) {
    const response = await fn();

    if (!retryStatuses.includes(response.status)) {
      return response;
    }

    if (attempt === retries - 1) {
      return response; // Return last response even if retry-able
    }

    // Check for Retry-After header
    const retryAfter = response.headers.get('Retry-After');
    const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : delay;

    console.log(`Got ${response.status}, retrying in ${waitTime}ms`);
    await new Promise((r) => setTimeout(r, waitTime));
  }

  throw new Error('Unreachable');
}

// Usage
const response = await withRetryOnStatus(
  () => client.run('./api/users.http'),
  { retryStatuses: [429, 503] }
);
```

## Retry with Jitter

Add randomness to prevent thundering herd:

```typescript
function jitter(base: number, factor = 0.3): number {
  const variance = base * factor;
  return base + (Math.random() * 2 - 1) * variance;
}

async function withRetryAndJitter<T>(
  fn: () => Promise<T>,
  options: {
    retries?: number;
    delay?: number;
    jitterFactor?: number;
  } = {}
): Promise<T> {
  const { retries = 3, delay = 1000, jitterFactor = 0.3 } = options;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === retries - 1) throw error;

      const waitTime = jitter(delay * Math.pow(2, attempt), jitterFactor);
      await new Promise((r) => setTimeout(r, waitTime));
    }
  }
  throw new Error('Unreachable');
}
```

## Circuit Breaker Pattern

Stop retrying after repeated failures:

```typescript
class CircuitBreaker {
  private failures = 0;
  private lastFailure = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  constructor(
    private threshold = 5,
    private resetTimeout = 60000
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailure > this.resetTimeout) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is open');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess() {
    this.failures = 0;
    this.state = 'closed';
  }

  private onFailure() {
    this.failures++;
    this.lastFailure = Date.now();
    if (this.failures >= this.threshold) {
      this.state = 'open';
    }
  }
}

// Usage
const breaker = new CircuitBreaker(5, 60000);

async function makeRequest() {
  return breaker.execute(() => client.run('./api/unreliable.http'));
}
```

## Combining with Error Handling

Full example with logging and metrics:

```typescript
interface RetryOptions {
  retries: number;
  delay: number;
  backoff: number;
  retryStatuses: number[];
  onRetry?: (attempt: number, error: Error | Response) => void;
}

async function robustRequest(
  client: Client,
  path: string,
  options: Partial<RetryOptions> = {}
): Promise<Response> {
  const {
    retries = 3,
    delay = 1000,
    backoff = 2,
    retryStatuses = [429, 500, 502, 503, 504],
    onRetry = () => {},
  } = options;

  let lastError: Error | undefined;
  let waitTime = delay;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await client.run(path);

      if (response.ok || !retryStatuses.includes(response.status)) {
        return response;
      }

      if (attempt < retries) {
        onRetry(attempt, response);
        await new Promise((r) => setTimeout(r, waitTime));
        waitTime *= backoff;
      }

      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      if (attempt < retries) {
        onRetry(attempt, error as Error);
        await new Promise((r) => setTimeout(r, waitTime));
        waitTime *= backoff;
      }
      lastError = error as Error;
    }
  }

  throw lastError;
}

// Usage
const response = await robustRequest(client, './api/data.http', {
  retries: 5,
  onRetry: (attempt, error) => {
    console.log(`Retry ${attempt + 1}:`, error);
  },
});
```
