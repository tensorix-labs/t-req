# T-Req Plugin Examples

> **Full documentation:** See the [Plugin Development Guide](https://t-req.io/docs/guides/plugins) for comprehensive documentation.

This directory contains example plugins demonstrating the T-Req plugin system.

## Native TypeScript Plugins

### treq-plugin-logging.ts

A logging plugin that demonstrates:
- Using `definePlugin` helper
- Hook implementation (`request.after`, `response.after`, `error`)
- Event subscription for engine events
- Setup and teardown lifecycle

**Usage in treq.config.ts:**
```typescript
import { defineConfig } from '@t-req/core';
import loggingPlugin from './examples/plugins/treq-plugin-logging';

export default defineConfig({
  plugins: [
    loggingPlugin({ verbose: true, prefix: '[API]' }),
  ],
});
```

### treq-plugin-retry.ts

A retry plugin that demonstrates:
- Using `response.after` hook to inspect responses
- Signaling retries via `output.retry`
- Error hook for network failures
- Exponential backoff with jitter

**Usage in treq.config.ts:**
```typescript
import { defineConfig } from '@t-req/core';
import retryPlugin from './examples/plugins/treq-plugin-retry';

export default defineConfig({
  plugins: [
    retryPlugin({
      maxRetries: 3,
      retryOn: [429, 500, 502, 503, 504],
      backoff: 'exponential',
    }),
  ],
});
```

## Subprocess Plugins

### treq_plugin_env.py (Python)

A Python plugin that demonstrates the subprocess plugin protocol:
- NDJSON communication over stdin/stdout
- Protocol initialization and capability declaration
- Custom resolvers (`$env`, `$timestamp`, `$uuid`, `$randomInt`)
- Hook implementation (`request.before`)

**Usage in treq.config.ts:**
```typescript
import { defineConfig } from '@t-req/core';

export default defineConfig({
  plugins: [
    {
      command: ['python3', './examples/plugins/treq_plugin_env.py'],
      config: { prefix: 'TREQ_' }
    },
  ],
});
```

**Usage in .http files:**
```http
GET {{baseUrl}}/api/data
X-Request-ID: {{$uuid()}}
X-Timestamp: {{$timestamp()}}
X-Api-Key: {{$env('API_KEY')}}
```

## Plugin Development Guide

### Native Plugins

1. Create a TypeScript file that exports a plugin factory function
2. Use `definePlugin` for validation and type safety
3. Implement hooks following the input/output pattern
4. Export the factory function as default

```typescript
import { definePlugin } from '@t-req/core';

export default function myPlugin(options = {}) {
  return definePlugin({
    name: 'my-plugin',
    version: '1.0.0',

    hooks: {
      async 'request.before'(input, output) {
        // Modify request
        output.request.headers['X-Custom'] = 'value';
      },

      async 'response.after'(input, output) {
        // Inspect response, optionally retry
        if (input.response.status === 429) {
          output.retry = { delayMs: 1000 };
        }
      }
    }
  });
}
```

### Subprocess Plugins

1. Create a script in any language that reads NDJSON from stdin
2. Respond with NDJSON to stdout
3. Implement the protocol:
   - `init`: Return capabilities
   - `resolver`: Return resolved value
   - `hook`: Return modified output
   - `event`: No response needed
   - `shutdown`: Exit gracefully

See `treq_plugin_env.py` for a complete example.

## Hook Lifecycle

```
parse.after      → request.before → request.compiled → request.after → fetch
                        ↑                                               ↓
                        └──────────── retry signal ◄─────────── response.after
```

| Hook | Purpose | Mutability |
|------|---------|------------|
| `parse.after` | Transform AST after parsing | Mutable |
| `request.before` | Early request modification | Mutable |
| `request.compiled` | Final modification after interpolation (signing) | Mutable |
| `request.after` | Read-only observation before fetch | Read-only |
| `response.after` | Process response, trigger retry | Mutable |
| `error` | Handle errors, trigger retry | Mutable |
