---
title: Introduction
description: What is @t-req/core and why use it as your HTTP request library
---

**@t-req/core** is an HTTP request parsing, execution, and testing library. Define requests in `.http` files, test them in isolation.

## What is @t-req/core?

@t-req/core lets you write HTTP requests in standard `.http` files—the same format used by VS Code REST Client and JetBrains HTTP Client—and execute them programmatically with TypeScript or JavaScript.

## Key Features

- **Parse `.http` files** - Standard format, no proprietary syntax
- **Variable interpolation** - `{{variable}}` syntax with custom resolvers
- **Native fetch Response** - Returns standard `Response` objects, no wrapper
- **Cookie management** - Automatic cookie jar with RFC 6265 compliance
- **Timeout & cancellation** - Built-in timeout and AbortSignal support
- **TypeScript first** - Full type definitions included

## Philosophy

**Requests are just code.** No DSL, no hidden state machines. Each `.http` file contains one request, and you orchestrate them with standard JavaScript:

```typescript
// Login and get token
const login = await client.run('./auth/login.http');
const { token } = await login.json();

// Use token for subsequent requests
client.setVariable('token', token);

// Fetch profile
const profile = await client.run('./users/profile.http');

// Standard control flow for complex scenarios
for (const id of userIds) {
  await client.run('./users/get.http', { variables: { userId: id } });
}
```

## Runtime Support

@t-req/core runs on:

- **Node.js** (>=18) - Pass `io: createNodeIO()` when creating the client
- **Bun** (>=1.0) - Works out of the box, uses Bun's filesystem APIs
- **Tauri/Desktop** - Renderer-safe via `runString()` for in-memory content

## When to Use @t-req/core

**Use the library (@t-req/core) when you need:**

- **Programmatic control** - Execute requests from your TypeScript/JavaScript code
- **API testing** - Write requests once, run them in tests
- **Building tools** - Create your own CLI, GUI, or automation on top of @t-req/core
- **CI/CD pipelines** - Automate API testing in your build process

**Use the CLI (coming soon) when you need:**

- Quick one-off request execution from the terminal
- Interactive exploration without writing code

## Next Steps

Ready to get started? Head to the [Installation](/getting-started/installation/) guide to add @t-req/core to your project.
