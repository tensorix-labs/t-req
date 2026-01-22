---
title: Config
description: API reference for defineConfig, loadConfig, and mergeConfig
---

The config system provides typed configuration files for @t-req/core projects.

## defineConfig

Define a typed configuration file.

```typescript
// treq.config.ts
import { defineConfig } from '@t-req/core/config';

export default defineConfig({
  variables: {
    baseUrl: 'https://api.example.com',
    apiVersion: 'v1',
  },
  resolvers: {
    $env: (key) => process.env[key] || '',
  },
  defaults: {
    timeoutMs: 30000,
    headers: {
      'User-Agent': 't-req/1.0',
    },
  },
});
```

### Config Options

| Option | Type | Description |
|--------|------|-------------|
| `variables` | `Record<string, unknown>` | Default variables |
| `resolvers` | `Record<string, Resolver>` | Custom resolver functions |
| `defaults` | `ConfigDefaults` | Default request settings |

### ConfigDefaults

```typescript
interface ConfigDefaults {
  timeoutMs?: number;
  headers?: Record<string, string>;
  followRedirects?: boolean;
  validateSSL?: boolean;
}
```

## loadConfig

Load configuration from the filesystem.

```typescript
import { loadConfig } from '@t-req/core/config';

const { config, configPath } = await loadConfig({
  startDir: process.cwd(),
});

console.log('Loaded config from:', configPath);
console.log('Variables:', config?.variables);
```

### Options

| Option | Type | Description |
|--------|------|-------------|
| `startDir` | `string` | Directory to start searching from |
| `configPath` | `string` | Explicit path to config file (optional) |

### Returns

```typescript
interface LoadConfigResult {
  config: TReqConfig | null;
  configPath: string | null;
}
```

### Config File Discovery

`loadConfig` searches for these files (in order):
1. `treq.config.ts`
2. `treq.config.js`
3. `treq.config.mjs`

It searches the start directory and all parent directories.

## mergeConfig

Merge multiple configuration sources.

```typescript
import { mergeConfig } from '@t-req/core/config';

const merged = mergeConfig({
  file: fileConfig,      // From loadConfig
  cli: cliConfig,        // From command line
  env: envConfig,        // From environment
});
```

### Merge Priority

Later sources override earlier ones:
1. `file` - Lowest priority
2. `cli` - Higher priority
3. `env` - Highest priority

### Example

```typescript
const { config } = await loadConfig({ startDir: process.cwd() });

const merged = mergeConfig({
  file: config,
  cli: {
    variables: {
      env: 'staging', // Override from CLI flag
    },
  },
});
```

## Using Config with Client

```typescript
import { loadConfig, mergeConfig } from '@t-req/core/config';
import { createClient } from '@t-req/core';
import { createNodeIO } from '@t-req/core/runtime';

// Load config
const { config } = await loadConfig({ startDir: process.cwd() });
const merged = mergeConfig({ file: config });

// Create client with config
const client = createClient({
  io: createNodeIO(),
  variables: merged.variables,
  resolvers: merged.resolvers,
  defaults: merged.defaults,
});
```

## Environment-Specific Configs

Use environment variables or separate files:

```typescript
// treq.config.ts
import { defineConfig } from '@t-req/core/config';

const env = process.env.TREQ_ENV || 'development';

const configs = {
  development: {
    baseUrl: 'http://localhost:3000',
  },
  staging: {
    baseUrl: 'https://staging-api.example.com',
  },
  production: {
    baseUrl: 'https://api.example.com',
  },
};

export default defineConfig({
  variables: configs[env],
  resolvers: {
    $env: (key) => process.env[key] || '',
  },
});
```

## Config Inheritance

For monorepos, create a base config and extend it:

```typescript
// packages/shared/treq.base.ts
export const baseConfig = {
  resolvers: {
    $env: (key) => process.env[key] || '',
    $uuid: () => crypto.randomUUID(),
  },
  defaults: {
    timeoutMs: 30000,
  },
};

// apps/api/treq.config.ts
import { defineConfig } from '@t-req/core/config';
import { baseConfig } from '@shared/treq.base';

export default defineConfig({
  ...baseConfig,
  variables: {
    baseUrl: 'https://api.example.com',
  },
});
```

## TypeScript Types

```typescript
import type {
  TReqConfig,
  ConfigDefaults,
  LoadConfigOptions,
  LoadConfigResult,
  MergeConfigOptions,
} from '@t-req/core/config';
```
