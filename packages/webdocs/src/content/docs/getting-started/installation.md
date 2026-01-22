---
title: Installation
description: How to install @t-req/core in your project
---

Install `@t-req/core` using your preferred package manager.

## Package Managers

```bash
# npm
npm install @t-req/core

# bun
bun add @t-req/core

# yarn
yarn add @t-req/core

# pnpm
pnpm add @t-req/core
```

## Runtime Requirements

- **Node.js** >=18
- **Bun** >=1.0

## Verify Installation

Create a simple test file to verify the installation:

```typescript
import { createClient } from '@t-req/core';

const client = createClient();

// If this compiles without errors, you're ready to go!
console.log('@t-req/core installed successfully!');
```

## Next Steps

Now that @t-req/core is installed, head to the [Quick Start](/getting-started/quick-start/) guide to create and run your first request.
