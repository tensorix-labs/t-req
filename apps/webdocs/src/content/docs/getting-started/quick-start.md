---
title: Quick Start
description: Create and run your first HTTP request with @t-req/core
---

This guide walks you through creating and running your first HTTP request with @t-req/core.

## 1. Create a `.http` File

Create a file called `api/users.http`:

```http
### Get Users
GET https://jsonplaceholder.typicode.com/users
Accept: application/json
```

## 2. Run the Request (Node.js)

```typescript
import { createClient } from '@t-req/core';
import { createNodeIO } from '@t-req/core/runtime';

const client = createClient({
  // Required in Node to run from files
  io: createNodeIO(),
});

const response = await client.run('./api/users.http');
const users = await response.json();

console.log(`Found ${users.length} users`);
```

## 3. Run the Request (Bun)

In Bun, the IO adapter is optional—@t-req/core uses Bun's built-in filesystem APIs:

```typescript
import { createClient } from '@t-req/core';

const client = createClient();

const response = await client.run('./api/users.http');
const users = await response.json();

console.log(`Found ${users.length} users`);
```

## 4. Use Variables

Create a `.http` file with variables:

```http
### Get User by ID
GET https://jsonplaceholder.typicode.com/users/{{userId}}
Accept: application/json
```

Pass variables when running:

```typescript
const response = await client.run('./api/user.http', {
  variables: { userId: '1' },
});

const user = await response.json();
console.log(`User: ${user.name}`);
```

## 5. Run from In-Memory Content

For desktop apps or when you don't have filesystem access, use `runString()`:

```typescript
import { createClient } from '@t-req/core';

const client = createClient();

const httpContent = `
GET https://jsonplaceholder.typicode.com/users/{{userId}}
Accept: application/json
`;

const response = await client.runString(httpContent, {
  variables: { userId: '1' },
});

const user = await response.json();
console.log(`User: ${user.name}`);
```

## Next Steps

- Learn about the [.http File Format](/concepts/http-file-format/) syntax
- Understand [Variables](/concepts/variables/) and custom resolvers
- Explore [Authentication](/guides/authentication/) patterns
