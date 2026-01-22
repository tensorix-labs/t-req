---
title: Error Handling
description: Handle parsing errors, network failures, and HTTP errors in @t-req/core
---

@t-req/core follows standard JavaScript error patterns. Understanding when and what errors occur helps you build robust applications.

## Error Types

### Parse Errors

Thrown when `.http` file syntax is invalid:

```typescript
import { parse } from '@t-req/core';

try {
  const requests = parse('not valid http content');
} catch (error) {
  // ParseError: Invalid request format
  console.error('Parsing failed:', error.message);
}
```

### Network Errors

Thrown when the request cannot be completed:

```typescript
try {
  await client.run('./api/unreachable.http');
} catch (error) {
  // TypeError: fetch failed
  // or similar network error
  console.error('Network error:', error.message);
}
```

### Timeout Errors

When a request exceeds its timeout:

```typescript
try {
  await client.run('./api/slow.http', { timeout: 5000 });
} catch (error) {
  if (error.name === 'AbortError') {
    console.error('Request timed out');
  }
}
```

### Cancellation

When a request is manually aborted:

```typescript
const controller = new AbortController();

// Cancel after 1 second
setTimeout(() => controller.abort(), 1000);

try {
  await client.run('./api/slow.http', {
    signal: controller.signal,
  });
} catch (error) {
  if (error.name === 'AbortError') {
    console.error('Request was cancelled');
  }
}
```

## HTTP Errors Are NOT Thrown

Non-2xx responses are **not** errors—they return a normal `Response`:

```typescript
const response = await client.run('./api/users.http');

// Check if request succeeded
if (!response.ok) {
  console.log('Request failed:', response.status, response.statusText);
  const errorBody = await response.json();
  console.log('Error details:', errorBody);
}
```

This follows the Fetch API convention where only network failures throw.

## Response Status Checking

### Simple Check

```typescript
const response = await client.run('./api/users.http');

if (!response.ok) {
  throw new Error(`HTTP ${response.status}: ${response.statusText}`);
}

const data = await response.json();
```

### Status-Specific Handling

```typescript
const response = await client.run('./api/users.http');

switch (response.status) {
  case 200:
    return await response.json();
  case 401:
    throw new Error('Authentication required');
  case 403:
    throw new Error('Access denied');
  case 404:
    return null; // Not found is acceptable
  case 429:
    throw new Error('Rate limited, try again later');
  default:
    throw new Error(`Unexpected status: ${response.status}`);
}
```

## Helper Function

Create a wrapper that throws on non-2xx:

```typescript
async function runOrThrow(
  client: Client,
  path: string,
  options?: RunOptions
): Promise<Response> {
  const response = await client.run(path, options);

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`HTTP ${response.status}: ${body}`);
  }

  return response;
}

// Usage
const response = await runOrThrow(client, './api/users.http');
const data = await response.json();
```

## Retry Logic

Handle transient failures with retries:

```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    retries?: number;
    delay?: number;
    backoff?: number;
  } = {}
): Promise<T> {
  const { retries = 3, delay = 1000, backoff = 2 } = options;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === retries - 1) throw error;

      const waitTime = delay * Math.pow(backoff, attempt);
      console.log(`Attempt ${attempt + 1} failed, retrying in ${waitTime}ms`);
      await new Promise((r) => setTimeout(r, waitTime));
    }
  }

  throw new Error('Unreachable');
}

// Usage
const response = await withRetry(() => client.run('./api/flaky.http'));
```

## Handling File Errors

When using file references:

```typescript
try {
  await client.run('./api/upload.http');
} catch (error) {
  if (error.code === 'ENOENT') {
    console.error('Referenced file not found');
  } else if (error.code === 'EACCES') {
    console.error('Permission denied reading file');
  } else {
    throw error;
  }
}
```

## Comprehensive Error Handler

```typescript
async function safeRun(client: Client, path: string, options?: RunOptions) {
  try {
    const response = await client.run(path, options);

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}`,
        status: response.status,
        body: await response.text(),
      };
    }

    return {
      success: true,
      response,
      data: await response.json(),
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      return { success: false, error: 'Request timed out or cancelled' };
    }
    if (error.code === 'ENOENT') {
      return { success: false, error: 'File not found' };
    }
    return { success: false, error: error.message };
  }
}

// Usage
const result = await safeRun(client, './api/users.http');
if (result.success) {
  console.log('Data:', result.data);
} else {
  console.error('Error:', result.error);
}
```

## Logging Errors

Use the engine for detailed error logging:

```typescript
import { createEngine } from '@t-req/core';

const engine = createEngine({
  onEvent: (event) => {
    if (event.type === 'request:error') {
      console.error('Request failed:', {
        url: event.request?.url,
        error: event.error.message,
        stack: event.error.stack,
      });
    }
  },
});
```
