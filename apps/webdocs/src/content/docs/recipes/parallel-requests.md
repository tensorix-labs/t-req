---
title: Parallel Requests
description: Execute multiple requests concurrently for better performance
---

Maximize throughput by running independent requests in parallel.

## Basic Parallel Execution

Use `Promise.all` for concurrent requests:

```typescript
const [users, posts, comments] = await Promise.all([
  client.run('./api/users.http'),
  client.run('./api/posts.http'),
  client.run('./api/comments.http'),
]);

// Parse all responses
const [usersData, postsData, commentsData] = await Promise.all([
  users.json(),
  posts.json(),
  comments.json(),
]);
```

## Parallel with Different Variables

Run the same request with different parameters:

```typescript
const userIds = ['1', '2', '3', '4', '5'];

const responses = await Promise.all(
  userIds.map((userId) =>
    client.run('./api/user.http', { variables: { userId } })
  )
);

const users = await Promise.all(
  responses.map((r) => r.json())
);
```

## Controlled Concurrency

Limit parallel requests to avoid overwhelming the server:

```typescript
async function parallelWithLimit<T>(
  tasks: (() => Promise<T>)[],
  limit: number
): Promise<T[]> {
  const results: T[] = [];
  const executing: Promise<void>[] = [];

  for (const task of tasks) {
    const p = task().then((result) => {
      results.push(result);
      executing.splice(executing.indexOf(p), 1);
    });

    executing.push(p);

    if (executing.length >= limit) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
  return results;
}

// Usage: max 3 concurrent requests
const userIds = Array.from({ length: 100 }, (_, i) => String(i + 1));

const responses = await parallelWithLimit(
  userIds.map((userId) => () =>
    client.run('./api/user.http', { variables: { userId } })
  ),
  3 // concurrency limit
);
```

## Promise.allSettled for Partial Failures

Continue even if some requests fail:

```typescript
const urls = [
  './api/users.http',
  './api/posts.http',
  './api/broken.http', // This might fail
];

const results = await Promise.allSettled(
  urls.map((url) => client.run(url))
);

// Process results
for (const [index, result] of results.entries()) {
  if (result.status === 'fulfilled') {
    console.log(`${urls[index]}: ${result.value.status}`);
    const data = await result.value.json();
    // Process data
  } else {
    console.error(`${urls[index]} failed:`, result.reason);
  }
}
```

## Batched Requests

Process items in batches:

```typescript
async function processBatches<T, R>(
  items: T[],
  batchSize: number,
  processor: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);

    // Optional: add delay between batches
    if (i + batchSize < items.length) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  return results;
}

// Usage
const userIds = Array.from({ length: 50 }, (_, i) => String(i + 1));

const users = await processBatches(
  userIds,
  10, // batch size
  async (userId) => {
    const response = await client.run('./api/user.http', {
      variables: { userId },
    });
    return response.json();
  }
);
```

## Dependent Parallel Requests

Some parallel, some sequential:

```typescript
// First: login (must be first)
const loginResponse = await client.run('./auth/login.http');
const { token } = await loginResponse.json();
client.setVariable('token', token);

// Then: parallel requests that need the token
const [profile, settings, notifications] = await Promise.all([
  client.run('./api/profile.http'),
  client.run('./api/settings.http'),
  client.run('./api/notifications.http'),
]);

// Parse results
const data = await Promise.all([
  profile.json(),
  settings.json(),
  notifications.json(),
]);
```

## Aggregating Results

Combine responses from multiple endpoints:

```typescript
interface AggregatedData {
  users: User[];
  posts: Post[];
  userPosts: Map<string, Post[]>;
}

async function fetchDashboardData(): Promise<AggregatedData> {
  const [usersResponse, postsResponse] = await Promise.all([
    client.run('./api/users.http'),
    client.run('./api/posts.http'),
  ]);

  const [users, posts] = await Promise.all([
    usersResponse.json() as Promise<User[]>,
    postsResponse.json() as Promise<Post[]>,
  ]);

  // Aggregate
  const userPosts = new Map<string, Post[]>();
  for (const post of posts) {
    const existing = userPosts.get(post.userId) || [];
    userPosts.set(post.userId, [...existing, post]);
  }

  return { users, posts, userPosts };
}
```

## Race Condition: First Response Wins

Use `Promise.race` for redundant requests:

```typescript
// Try multiple mirrors, use first response
const mirrors = [
  'https://api1.example.com',
  'https://api2.example.com',
  'https://api3.example.com',
];

const fastestResponse = await Promise.race(
  mirrors.map((baseUrl) =>
    client.runString(`GET ${baseUrl}/data\n`)
  )
);
```

## Timeout for Parallel Requests

Add timeout to parallel operations:

```typescript
async function parallelWithTimeout<T>(
  promises: Promise<T>[],
  timeoutMs: number
): Promise<T[]> {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Parallel timeout')), timeoutMs);
  });

  return Promise.race([
    Promise.all(promises),
    timeout,
  ]);
}

// Usage
const responses = await parallelWithTimeout(
  [
    client.run('./api/users.http'),
    client.run('./api/posts.http'),
  ],
  5000 // 5 second timeout for all
);
```
