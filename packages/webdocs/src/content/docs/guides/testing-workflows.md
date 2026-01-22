---
title: Testing Workflows
description: Build multi-step API testing workflows with @t-req/core
---

@t-req/core excels at multi-step testing workflows. Since requests are just code, you use standard JavaScript patterns.

## Sequential Requests

Chain requests where each depends on the previous:

```typescript
import { createClient } from '@t-req/core';
import { createNodeIO } from '@t-req/core/runtime';

const client = createClient({
  io: createNodeIO(),
  variables: {
    baseUrl: 'https://api.example.com',
    email: 'test@example.com',
    password: 'secret',
  },
});

// 1. Login
const loginResponse = await client.run('./auth/login.http');
const { token, userId } = await loginResponse.json();
client.setVariable('token', token);

// 2. Get profile
const profileResponse = await client.run('./users/profile.http');
const profile = await profileResponse.json();
console.log('Profile:', profile.name);

// 3. Update profile
client.setVariable('newName', 'Updated Name');
const updateResponse = await client.run('./users/update.http');
console.log('Updated:', updateResponse.ok);

// 4. Verify update
const verifyResponse = await client.run('./users/profile.http');
const updated = await verifyResponse.json();
console.assert(updated.name === 'Updated Name', 'Name should be updated');
```

## Parallel Requests

Execute independent requests concurrently:

```typescript
const [users, posts, comments] = await Promise.all([
  client.run('./api/users.http'),
  client.run('./api/posts.http'),
  client.run('./api/comments.http'),
]);

const [usersData, postsData, commentsData] = await Promise.all([
  users.json(),
  posts.json(),
  comments.json(),
]);
```

## Iteration Patterns

Process multiple items:

```typescript
// Sequential (order matters or rate limiting)
for (const userId of userIds) {
  await client.run('./users/get.http', {
    variables: { userId },
  });
}

// Parallel (independent operations)
const responses = await Promise.all(
  userIds.map((userId) =>
    client.run('./users/get.http', { variables: { userId } })
  )
);
```

## Setup and Teardown

Ensure cleanup even when tests fail:

```typescript
try {
  // Setup
  await client.run('./setup/create-test-user.http');

  // Test
  await client.run('./test/user-workflow.http');

  // Assertions
  const response = await client.run('./test/verify-results.http');
  const data = await response.json();
  console.assert(data.success, 'Workflow should succeed');
} finally {
  // Cleanup - always runs
  await client.run('./teardown/delete-test-user.http');
}
```

## Test Helpers

Create reusable test utilities:

```typescript
// helpers.ts
export async function login(client: Client, email: string, password: string) {
  client.setVariables({ email, password });
  const response = await client.run('./auth/login.http');
  const { token } = await response.json();
  client.setVariable('token', token);
  return token;
}

export async function assertOk(response: Response, message: string) {
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${message}: ${response.status} - ${body}`);
  }
}

// test.ts
await login(client, 'test@example.com', 'secret');
const response = await client.run('./api/protected.http');
await assertOk(response, 'Protected endpoint should be accessible');
```

## Data-Driven Tests

Run the same workflow with different inputs:

```typescript
const testCases = [
  { email: 'user1@example.com', expectedRole: 'user' },
  { email: 'admin@example.com', expectedRole: 'admin' },
  { email: 'guest@example.com', expectedRole: 'guest' },
];

for (const { email, expectedRole } of testCases) {
  client.setVariable('email', email);
  const response = await client.run('./users/get-role.http');
  const { role } = await response.json();
  console.assert(role === expectedRole, `${email} should have role ${expectedRole}`);
}
```

## Integration with Test Frameworks

### Bun Test

```typescript
import { test, expect } from 'bun:test';
import { createClient } from '@t-req/core';

const client = createClient();

test('user can login', async () => {
  const response = await client.run('./auth/login.http');
  expect(response.ok).toBe(true);

  const { token } = await response.json();
  expect(token).toBeDefined();
});

test('authenticated user can access profile', async () => {
  // Login first
  const loginResponse = await client.run('./auth/login.http');
  const { token } = await loginResponse.json();
  client.setVariable('token', token);

  // Access profile
  const profileResponse = await client.run('./users/profile.http');
  expect(profileResponse.ok).toBe(true);
});
```

### Vitest

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@t-req/core';
import { createNodeIO } from '@t-req/core/runtime';

describe('API Workflow', () => {
  const client = createClient({ io: createNodeIO() });

  beforeAll(async () => {
    const response = await client.run('./auth/login.http');
    const { token } = await response.json();
    client.setVariable('token', token);
  });

  it('fetches user profile', async () => {
    const response = await client.run('./users/profile.http');
    expect(response.ok).toBe(true);
  });
});
```

## Environment-Specific Variables

Switch between environments:

```typescript
const environments = {
  dev: {
    baseUrl: 'https://dev-api.example.com',
    apiKey: process.env.DEV_API_KEY,
  },
  staging: {
    baseUrl: 'https://staging-api.example.com',
    apiKey: process.env.STAGING_API_KEY,
  },
  prod: {
    baseUrl: 'https://api.example.com',
    apiKey: process.env.PROD_API_KEY,
  },
};

const env = process.env.TEST_ENV || 'dev';
const client = createClient({
  io: createNodeIO(),
  variables: environments[env],
});
```
