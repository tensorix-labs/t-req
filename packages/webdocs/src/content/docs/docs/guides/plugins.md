---
title: Plugins
description: Extend t-req with custom resolvers, hooks, commands, and middleware.
---

Plugins let you extend t-req with custom functionality. Add dynamic variable resolvers, intercept requests and responses, register CLI commands, or inject server middleware.

## What plugins can do

- **Custom resolvers** — `{{$timestamp()}}`, `{{$env(API_KEY)}}`, `{{$hmacSign(payload)}}`
- **Lifecycle hooks** — Transform requests, retry on failure, log responses
- **CLI commands** — Add `treq mycommand` subcommands
- **Server middleware** — Inject authentication, logging, or custom routes into `treq serve`
- **Tools** — Define typed tools with Zod schemas for AI/agent workflows

## Quick start

```typescript
// treq-plugin-timing.ts
import { definePlugin } from '@t-req/core';

export default definePlugin({
  name: 'timing',
  version: '1.0.0',

  hooks: {
    async 'response.after'(input, output) {
      console.log(`${input.request.method} ${input.request.url} - ${input.timing.total}ms`);
    }
  }
});
```

Add to your config:

```jsonc
// treq.jsonc
{
  "plugins": [
    "file://./treq-plugin-timing.ts"
  ]
}
```

## Plugin configuration

Plugins are configured in `treq.jsonc` (or legacy `treq.config.ts`):

```jsonc
{
  "plugins": [
    // NPM package
    "@acme/treq-plugin-auth",

    // NPM package with options
    ["@acme/treq-plugin-retry", { "maxRetries": 3 }],

    // Local file (file:// URL)
    "file://./plugins/my-plugin.ts",

    // Subprocess plugin (any language)
    {
      "command": ["python3", "./plugins/hmac-signer.py"],
      "config": { "algorithm": "sha256" },
      "timeoutMs": 5000
    }
  ],

  // Optional: restrict plugin permissions
  "pluginPermissions": {
    "default": ["env"],
    "@acme/treq-plugin-auth": ["secrets", "network"]
  }
}
```

### Plugin sources

| Source | Format | Example |
|--------|--------|---------|
| NPM package | `"package-name"` | `"@acme/treq-plugin-auth"` |
| NPM with options | `["package-name", options]` | `["@acme/retry", { "max": 3 }]` |
| Local file | `"file://path"` | `"file://./plugins/my-plugin.ts"` |
| Subprocess | `{ command: [...] }` | `{ "command": ["python3", "plugin.py"] }` |
| Inline (TS only) | Plugin object | `myPlugin({ verbose: true })` |

## Permissions

Plugins declare required permissions. Users can restrict what plugins can access:

| Permission | Grants access to |
|------------|------------------|
| `secrets` | Secret managers (Vault, AWS SSM) |
| `network` | Outbound HTTP requests |
| `filesystem` | Read/write files outside project |
| `env` | Process environment variables |
| `subprocess` | Spawn child processes |
| `enterprise` | Enterprise context (org, user, session) |

```typescript
definePlugin({
  name: 'my-plugin',
  permissions: ['env', 'network'], // Declare what you need

  async setup(ctx) {
    // ctx.env is only available if 'env' permission granted
    const apiKey = ctx.env?.API_KEY;

    // ctx.fetch is only available if 'network' permission granted
    await ctx.fetch?.('https://example.com/register');
  }
});
```

## Hooks reference

Hooks let you intercept and modify the request lifecycle:

```
parse.after → request.before → request.compiled → request.after → fetch
                   ↑                                                ↓
                   └─────────── retry signal ◄────────────── response.after
                                                                    ↓
                                                                  error
```

### parse.after

Called after parsing a `.http` file. Modify the AST before execution.

```typescript
hooks: {
  'parse.after'(input, output) {
    // Add a header to all requests in the file
    for (const req of output.file.requests) {
      req.headers['X-Parsed-By'] = 'my-plugin';
    }
  }
}
```

**Input:** `{ file: ParsedHttpFile, path: string }`
**Output:** `{ file: ParsedHttpFile }` (mutable)

### request.before

Called before variable interpolation. Add headers, modify URL, or skip the request.

```typescript
hooks: {
  'request.before'(input, output) {
    // Add auth header
    output.request.headers['Authorization'] = `Bearer ${input.variables.token}`;

    // Skip requests to certain domains
    if (input.request.url.includes('internal.corp')) {
      output.skip = true;
    }
  }
}
```

**Input:** `{ request, variables, ctx }`
**Output:** `{ request, skip? }` (mutable)

### request.compiled

Called after interpolation, before fetch. Final chance to modify — ideal for signing.

```typescript
hooks: {
  async 'request.compiled'(input, output) {
    // Sign the request (all variables already interpolated)
    const signature = await sign(output.request.body);
    output.request.headers['X-Signature'] = signature;
  }
}
```

**Input:** `{ request: CompiledRequest, variables, ctx }`
**Output:** `{ request }` (mutable)

### request.after

Called immediately before fetch. Read-only observation for logging, metrics, audit.

```typescript
hooks: {
  'request.after'(input) {
    console.log(`→ ${input.request.method} ${input.request.url}`);
  }
}
```

**Input:** `{ request: CompiledRequest, ctx }`
**Output:** None (read-only)

### response.after

Called after receiving a response. Process, log, or signal retry.

```typescript
hooks: {
  async 'response.after'(input, output) {
    // Log response
    console.log(`← ${input.response.status} (${input.timing.total}ms)`);

    // Retry on rate limit
    if (input.response.status === 429) {
      const retryAfter = input.response.headers.get('Retry-After');
      output.retry = {
        delayMs: retryAfter ? parseInt(retryAfter) * 1000 : 1000,
        reason: 'Rate limited'
      };
    }
  }
}
```

**Input:** `{ request, response, timing, ctx }`
**Output:** `{ status?, statusText?, headers?, body?, retry? }`

### error

Called when a request fails (network error, timeout). Handle or signal retry.

```typescript
hooks: {
  error(input, output) {
    if (input.error.code === 'ECONNRESET' && input.ctx.retries < input.ctx.maxRetries) {
      output.retry = { delayMs: 1000, reason: 'Connection reset' };
    }
  }
}
```

**Input:** `{ request, error, ctx }`
**Output:** `{ error, retry?, suppress? }`

## Custom resolvers

Resolvers provide dynamic values in `{{$name(args)}}` syntax. Names must start with `$`.

```typescript
definePlugin({
  name: 'my-resolvers',

  resolvers: {
    // Simple resolver
    $timestamp: () => String(Date.now()),

    // Resolver with arguments
    $env: (key) => process.env[key] ?? '',

    // Async resolver
    $vault: async (path) => {
      const secret = await fetchFromVault(path);
      return secret;
    },

    // Multiple arguments (use JSON array syntax in .http files)
    $hmac: (algorithm, secret, data) => {
      return createHmac(algorithm, secret).update(data).digest('hex');
    }
  }
});
```

Usage in `.http` files:

```http
GET {{baseUrl}}/api/data
X-Timestamp: {{$timestamp()}}
X-Api-Key: {{$env(API_KEY)}}
Authorization: {{$vault(secret/api-key)}}
X-Signature: {{$hmac(["sha256", "{{secret}}", "{{body}}"])}}
```

## Subprocess plugins

Write plugins in any language. Communicate over stdin/stdout using NDJSON.

### Protocol overview

1. **t-req spawns your process** with the configured command
2. **Init handshake** — t-req sends `init`, plugin responds with capabilities
3. **Requests/events** — t-req sends resolver, hook, or event messages
4. **Shutdown** — t-req sends `shutdown`, plugin exits gracefully

### Message types

**Init request:**
```json
{"id":"1","type":"init","protocolVersion":1,"config":{"key":"value"},"projectRoot":"/path"}
```

**Init response:**
```json
{"id":"1","type":"response","result":{"name":"my-plugin","version":"1.0.0","protocolVersion":1,"capabilities":["resolvers","hooks"],"resolvers":["$env","$timestamp"],"hooks":["request.before"]}}
```

**Resolver request:**
```json
{"id":"2","type":"resolver","name":"$env","args":["API_KEY"]}
```

**Resolver response:**
```json
{"id":"2","type":"response","result":{"value":"secret123"}}
```

**Hook request:**
```json
{"id":"3","type":"hook","name":"request.before","input":{...},"output":{...}}
```

**Hook response:**
```json
{"id":"3","type":"response","result":{"output":{...}}}
```

**Event (no response):**
```json
{"type":"event","event":{"type":"fetchStarted","method":"GET","url":"..."}}
```

**Shutdown (no response):**
```json
{"type":"shutdown"}
```

### Python example

See [`examples/plugins/treq_plugin_env.py`](https://github.com/tensorix-labs/t-req/blob/main/examples/plugins/treq_plugin_env.py) for a complete Python subprocess plugin that provides `$env`, `$timestamp`, `$uuid`, and `$randomInt` resolvers.

```python
#!/usr/bin/env python3
import json
import sys
import os

def main():
    for line in sys.stdin:
        msg = json.loads(line.strip())
        msg_type = msg.get("type")
        msg_id = msg.get("id")

        if msg_type == "init":
            response = {
                "id": msg_id,
                "type": "response",
                "result": {
                    "name": "my-python-plugin",
                    "protocolVersion": 1,
                    "capabilities": ["resolvers"],
                    "resolvers": ["$env"]
                }
            }
        elif msg_type == "resolver":
            name = msg.get("name")
            args = msg.get("args", [])
            value = os.environ.get(args[0], "") if args else ""
            response = {"id": msg_id, "type": "response", "result": {"value": value}}
        elif msg_type == "shutdown":
            break
        else:
            continue

        print(json.dumps(response), flush=True)

if __name__ == "__main__":
    main()
```

## Advanced features

### CLI commands

Register custom CLI commands:

```typescript
definePlugin({
  name: 'openapi-importer',

  commands: {
    'import-openapi': async (ctx) => {
      const [specPath] = ctx.args;
      const spec = JSON.parse(await ctx.readFile(specPath));

      for (const [path, methods] of Object.entries(spec.paths)) {
        for (const [method, op] of Object.entries(methods)) {
          await ctx.writeHttpFile(`requests/${op.operationId}.http`, [{
            name: op.summary,
            method: method.toUpperCase(),
            url: `{{baseUrl}}${path}`,
          }]);
        }
      }

      ctx.log(`Imported ${Object.keys(spec.paths).length} endpoints`);
    }
  }
});
```

Usage: `treq import-openapi ./openapi.json`

### Server middleware

Inject middleware into `treq serve`:

```typescript
definePlugin({
  name: 'cors-plugin',

  middleware: [
    async (req, res, next) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        return res.end();
      }
      await next();
    }
  ]
});
```

### Tools with Zod schemas

Define typed tools for AI/agent workflows:

```typescript
import { definePlugin, tool, z } from '@t-req/core';

definePlugin({
  name: 'crypto-tools',

  tools: {
    hash: tool({
      description: 'Hash a value with SHA-256',
      args: {
        value: z.string().describe('Value to hash'),
        encoding: z.enum(['hex', 'base64']).default('hex'),
      },
      async execute(args) {
        const hash = createHash('sha256').update(args.value).digest(args.encoding);
        return hash;
      }
    })
  }
});
```

### Setup and teardown

Initialize resources on load, clean up on shutdown:

```typescript
definePlugin({
  name: 'db-plugin',

  async setup(ctx) {
    ctx.log.info('Connecting to database...');
    this.db = await connectToDb(ctx.config.variables.dbUrl);
  },

  async teardown() {
    await this.db?.close();
  }
});
```

## Best practices

1. **Declare permissions** — Only request what you need. Users can restrict plugins.

2. **Handle errors gracefully** — Don't crash the pipeline. Log and continue where possible.

3. **Use async sparingly** — Hooks run in sequence. Keep them fast.

4. **Namespace resolvers** — Use prefixes like `$myPlugin_timestamp` to avoid conflicts.

5. **Version your plugins** — Helps users track compatibility.

6. **Document configuration** — Explain what options your plugin accepts.

7. **Test with subprocess** — If building a subprocess plugin, test the NDJSON protocol with `echo '{"type":"init",...}' | your-plugin`.

## Example plugins

The repository includes example plugins demonstrating common patterns:

- **[treq-plugin-logging.ts](https://github.com/tensorix-labs/t-req/blob/main/examples/plugins/treq-plugin-logging.ts)** — Logging with hook lifecycle
- **[treq-plugin-retry.ts](https://github.com/tensorix-labs/t-req/blob/main/examples/plugins/treq-plugin-retry.ts)** — Retry with exponential backoff
- **[treq_plugin_env.py](https://github.com/tensorix-labs/t-req/blob/main/examples/plugins/treq_plugin_env.py)** — Python subprocess plugin

See the [`examples/plugins/`](https://github.com/tensorix-labs/t-req/tree/main/examples/plugins) directory for the full source code.
