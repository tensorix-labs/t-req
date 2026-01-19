---
title: Interpolation
description: API reference for interpolate and createInterpolator functions
---

The interpolation system replaces `{{variable}}` placeholders with actual values.

## interpolate

Simple one-shot interpolation.

```typescript
import { interpolate } from '@t-req/core';

const result = interpolate('Hello {{name}}!', { name: 'World' });
// "Hello World!"
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `template` | `string` | String containing `{{variable}}` placeholders |
| `variables` | `Record<string, unknown>` | Variable values |

### Returns

`string` - The interpolated string.

## createInterpolator

Create a reusable interpolator with custom resolvers.

```typescript
import { createInterpolator } from '@t-req/core';

const interp = createInterpolator({
  resolvers: {
    $env: (key) => process.env[key] || '',
    $timestamp: () => String(Date.now()),
    $uuid: () => crypto.randomUUID(),
  },
});

const result = await interp.interpolate(
  'Time: {{$timestamp()}} ID: {{$uuid()}}',
  {}
);
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `resolvers` | `Record<string, Resolver>` | `{}` | Custom resolver functions |
| `undefinedBehavior` | `'throw' \| 'keep' \| 'empty'` | `'throw'` | How to handle undefined variables |

#### undefinedBehavior

Controls what happens when a variable is not found:

- `'throw'` — Throw an error (default, recommended for catching typos)
- `'keep'` — Keep the `{{variable}}` placeholder unchanged
- `'empty'` — Replace with an empty string

```typescript
const interp = createInterpolator({
  undefinedBehavior: 'keep', // {{missing}} stays as "{{missing}}"
});
```

### Interpolator Methods

#### interpolate(template, variables)

Interpolate a string template.

```typescript
const result = await interp.interpolate(
  'GET {{baseUrl}}/users/{{userId}}',
  { baseUrl: 'https://api.example.com', userId: '123' }
);
// "GET https://api.example.com/users/123"
```

## Variable Syntax

### Simple Variables

```
{{variableName}}
```

```typescript
interpolate('Hello {{name}}', { name: 'World' });
// "Hello World"
```

### Nested Properties

```
{{object.property}}
{{object.nested.value}}
```

```typescript
interpolate('User: {{user.name}}', {
  user: { name: 'John', id: 123 }
});
// "User: John"
```

### Resolver Calls

```
{{$resolverName()}}
{{$resolverName(arg1)}}
{{$resolverName(arg1, arg2)}}
```

```typescript
const interp = createInterpolator({
  resolvers: {
    $random: (min = '0', max = '100') => {
      const minNum = Number(min);
      const maxNum = Number(max);
      return String(Math.floor(Math.random() * (maxNum - minNum + 1)) + minNum);
    },
  },
});

await interp.interpolate('Value: {{$random(1, 10)}}', {});
// "Value: 7" (random between 1-10)
```

## Resolver Type

```typescript
type Resolver = (...args: string[]) => string | Promise<string>;
```

Resolvers:
- Receive string arguments (parsed from the template)
- Return a string (sync) or Promise<string> (async)
- Are called with `$` prefix in templates

## Common Resolver Patterns

### Environment Variables

```typescript
$env: (key) => process.env[key] || ''
```

```
Authorization: Bearer {{$env(API_TOKEN)}}
```

### Timestamps

```typescript
$timestamp: () => String(Date.now()),
$isoDate: () => new Date().toISOString(),
$date: (format = 'YYYY-MM-DD') => {
  // Implement date formatting
  return new Date().toISOString().split('T')[0];
},
```

### Random Values

```typescript
$uuid: () => crypto.randomUUID(),
$random: (min = '0', max = '100') => {
  return String(Math.floor(Math.random() * (Number(max) - Number(min) + 1)) + Number(min));
},
$randomString: (length = '8') => {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < Number(length); i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
},
```

### Encoding

```typescript
$base64: (value) => Buffer.from(value).toString('base64'),
$urlEncode: (value) => encodeURIComponent(value),
$jsonStringify: (value) => JSON.stringify(value),
```

### Async Resolvers

```typescript
$fetchSecret: async (key) => {
  const response = await fetch(`https://vault.example.com/secrets/${key}`);
  const { value } = await response.json();
  return value;
},
```

## Interpolating Objects

Interpolate all string values in an object:

```typescript
const request = {
  url: 'https://{{baseUrl}}/users/{{userId}}',
  headers: {
    Authorization: 'Bearer {{token}}',
  },
};

// Recursively interpolate
function interpolateObject(obj, variables) {
  if (typeof obj === 'string') {
    return interpolate(obj, variables);
  }
  if (Array.isArray(obj)) {
    return obj.map(item => interpolateObject(item, variables));
  }
  if (typeof obj === 'object' && obj !== null) {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = interpolateObject(value, variables);
    }
    return result;
  }
  return obj;
}
```

## TypeScript Types

```typescript
import type {
  Interpolator,
  InterpolateOptions,
  Resolver,
} from '@t-req/core';
```
