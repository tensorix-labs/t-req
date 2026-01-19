---
title: Variables
description: Variable interpolation and custom resolvers in @t-req/core
---

@t-req/core supports powerful variable interpolation with `{{variable}}` syntax and custom resolvers for dynamic values.

## Basic Variables

Pass variables when creating the client or running requests:

```typescript
const client = createClient({
  variables: {
    baseUrl: 'https://api.example.com',
    apiKey: 'secret-key',
  },
});

// Use in .http files
// GET {{baseUrl}}/users
// Authorization: Bearer {{apiKey}}
```

## Runtime Variables

Update variables at runtime:

```typescript
// Set a single variable
client.setVariable('token', 'new-token');

// Set multiple variables
client.setVariables({ a: 1, b: 2 });

// Get all variables
console.log(client.getVariables());
```

## Per-Request Variables

Override or add variables for a specific request:

```typescript
const response = await client.run('./api/user.http', {
  variables: { userId: '123' },
});
```

## Nested Object Paths

Access nested properties with dot notation:

```typescript
const client = createClient({
  variables: {
    user: { name: 'John', id: 123 },
  },
});

// In .http file: GET /users/{{user.id}}
```

## Custom Resolvers

Resolvers provide dynamic values. They're functions called with optional arguments:

```typescript
const client = createClient({
  resolvers: {
    $env: (key) => process.env[key] || '',
    $timestamp: () => String(Date.now()),
    $uuid: () => crypto.randomUUID(),
    $random: (min = '0', max = '100') => {
      const minNum = Number(min);
      const maxNum = Number(max);
      return String(Math.floor(Math.random() * (maxNum - minNum + 1)) + minNum);
    },
  },
});
```

Use resolvers in `.http` files:

```http
POST https://api.example.com/data
Authorization: Bearer {{$env(API_KEY)}}
X-Request-ID: {{$uuid()}}
X-Timestamp: {{$timestamp()}}

{
  "random_value": {{$random(1, 100)}}
}
```

## Common Resolver Patterns

@t-req/core provides the resolver architecture but ships with **zero built-in resolvers**. You must implement any resolvers you want to use. Here are common patterns:

### Environment Variables

```typescript
$env: (key) => process.env[key] || ''
```

```http
Authorization: Bearer {{$env(API_TOKEN)}}
```

### Timestamps

```typescript
$timestamp: () => String(Date.now()),
$isoDate: () => new Date().toISOString(),
```

```http
X-Timestamp: {{$timestamp()}}
X-Date: {{$isoDate()}}
```

### Random Values

```typescript
$uuid: () => crypto.randomUUID(),
$random: (min = '0', max = '100') => {
  return String(Math.floor(Math.random() * (Number(max) - Number(min) + 1)) + Number(min));
},
```

### Base64 Encoding

```typescript
$base64: (value) => Buffer.from(value).toString('base64'),
```

```http
Authorization: Basic {{$base64(username:password)}}
```

## Using the Interpolator Directly

For advanced use cases, use the interpolator directly:

```typescript
import { interpolate, createInterpolator } from '@t-req/core';

// Simple interpolation
const result = interpolate('Hello {{name}}!', { name: 'World' });
// "Hello World!"

// With resolvers
const interp = createInterpolator({
  resolvers: {
    $timestamp: () => String(Date.now()),
  },
});

const result = await interp.interpolate(
  'Time: {{$timestamp()}}',
  {}
);
```

## Variable Precedence

When the same variable is defined in multiple places:

1. Per-request `variables` option (highest priority)
2. `client.setVariable()` / `client.setVariables()`
3. Initial `createClient({ variables })` (lowest priority)

```typescript
const client = createClient({
  variables: { env: 'dev' },
});

client.setVariable('env', 'staging');

// This uses env = 'prod'
await client.run('./api.http', {
  variables: { env: 'prod' },
});
```

## Undefined Variable Handling

Control what happens when a variable is not found during interpolation with the `undefinedBehavior` option:

```typescript
import { createInterpolator } from '@t-req/core';

// Default: throw an error
const strict = createInterpolator({
  undefinedBehavior: 'throw', // throws Error for undefined variables
});

// Keep the placeholder as-is
const keep = createInterpolator({
  undefinedBehavior: 'keep', // {{missing}} stays as "{{missing}}"
});

// Replace with empty string
const empty = createInterpolator({
  undefinedBehavior: 'empty', // {{missing}} becomes ""
});
```

| Value | Behavior |
|-------|----------|
| `'throw'` | Throw an error (default) |
| `'keep'` | Keep the `{{variable}}` placeholder unchanged |
| `'empty'` | Replace with empty string |

This is useful for:
- **Development**: Use `'throw'` to catch missing variables early
- **Templates**: Use `'keep'` when processing templates in stages
- **Optional values**: Use `'empty'` when undefined should mean "no value"
