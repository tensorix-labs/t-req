---
title: Request Lifecycle
description: Understanding how @t-req/core processes requests from parse to execute
---

Understanding the request lifecycle helps you debug issues and extend @t-req/core's behavior.

## Overview

A request goes through three main phases:

```
Parse → Interpolate → Execute
```

## 1. Parse Phase

The `.http` file content is parsed into a structured `ParsedRequest` object:

```typescript
import { parse } from '@t-req/core';

const requests = parse(`
### Get Users
GET https://api.example.com/users/{{userId}}
Authorization: Bearer {{token}}
`);

console.log(requests[0]);
// {
//   name: "Get Users",
//   method: "GET",
//   url: "https://api.example.com/users/{{userId}}",
//   headers: { Authorization: "Bearer {{token}}" },
//   body: undefined,
//   meta: {}
// }
```

At this stage, variables are **not** replaced—they remain as `{{variable}}` placeholders.

## 2. Interpolate Phase

Variables and resolvers are applied to produce the final request values:

```typescript
import { interpolate } from '@t-req/core';

const url = interpolate(
  'https://api.example.com/users/{{userId}}',
  { userId: '123' }
);
// "https://api.example.com/users/123"
```

The interpolator:
1. Finds all `{{...}}` placeholders
2. Looks up each variable in the provided context
3. Calls resolvers for `$resolver()` patterns
4. Replaces placeholders with actual values

## 3. Execute Phase

The interpolated request is executed via the transport layer:

```typescript
// Internally, @t-req/core builds a fetch Request and executes it
const response = await fetch(url, {
  method: 'GET',
  headers: { Authorization: 'Bearer actual-token' },
});
```

## Client vs Engine

@t-req/core provides two APIs with different levels of abstraction:

### Client (High-Level)

The `createClient()` API handles the full lifecycle automatically:

```typescript
import { createClient } from '@t-req/core';
import { createNodeIO } from '@t-req/core/runtime';

const client = createClient({
  io: createNodeIO(),
  variables: { userId: '123' },
});

// Parse + Interpolate + Execute in one call
const response = await client.run('./api/user.http');
```

### Engine (Low-Level)

The `createEngine()` API gives you more control and emits events:

```typescript
import { createEngine } from '@t-req/core';
import { createFetchTransport } from '@t-req/core/runtime';

const engine = createEngine({
  transport: createFetchTransport(fetch),
  onEvent: (event) => {
    switch (event.type) {
      case 'request:start':
        console.log('Starting:', event.request.url);
        break;
      case 'request:complete':
        console.log('Status:', event.response.status);
        break;
      case 'request:error':
        console.error('Error:', event.error);
        break;
    }
  },
});

await engine.runString('GET https://example.com\n');
```

## File Loading

When using `client.run('./file.http')`, the file is loaded before parsing:

```
Load File → Parse → Interpolate → Execute
```

For file references in the body (`< ./payload.json`), loading happens during execution:

```
Parse → Interpolate → Load Referenced Files → Execute
```

## Request Options

Each phase can be customized with options:

```typescript
const response = await client.run('./api/user.http', {
  // Interpolation options
  variables: { userId: '123' },

  // Execution options
  timeout: 5000,
  signal: controller.signal,
});
```

## Error Handling by Phase

Errors can occur at each phase:

| Phase | Error Type | Example |
|-------|-----------|---------|
| Parse | `ParseError` | Invalid `.http` syntax |
| Interpolate | Variable not found | Missing `{{variable}}` |
| Execute | Network error | Connection refused |
| Execute | Timeout | Request exceeded timeout |

```typescript
try {
  await client.run('./api.http');
} catch (error) {
  if (error instanceof ParseError) {
    console.error('Invalid .http syntax');
  } else if (error.name === 'AbortError') {
    console.error('Request timed out or cancelled');
  } else {
    console.error('Network error:', error.message);
  }
}
```
