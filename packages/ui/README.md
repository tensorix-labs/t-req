# @t-req/ui

Shared UI components and styling foundation for t-req applications.

`@t-req/ui/styles` now bundles:
- Tailwind CSS v4 output
- t-req design tokens and utilities
- DaisyUI v5 components (for example `btn`, `card`, `input`)
- Custom DaisyUI themes: `treq` and `treq-dark`

## Installation

```bash
# bun
bun add @t-req/ui

# npm
npm install @t-req/ui

# pnpm
pnpm add @t-req/ui

# yarn
yarn add @t-req/ui
```

## Usage

### Importing Styles

Import the base CSS in your application entry point:

```ts
import "@t-req/ui/styles";
```

This includes:
- Tailwind base + utilities
- DaisyUI component classes
- t-req theme CSS variables and utility classes

### Importing Fonts

For Inter + JetBrains Mono font support:

```ts
import "@t-req/ui/fonts";
```

### DaisyUI Themes

`@t-req/ui/styles` ships with two custom DaisyUI themes:
- `treq` (default light theme)
- `treq-dark` (default dark theme when `prefers-color-scheme: dark`)
- `treq-contract` (high-contrast black/white contract style with restrained blue accent)

You can also force a theme explicitly:

```html
<html data-theme="treq">
  ...
</html>
```

```html
<html data-theme="treq-dark">
  ...
</html>
```

```html
<html data-theme="treq-contract">
  ...
</html>
```

### DaisyUI Class Usage

No prefix is configured. Use standard DaisyUI classes directly:

```html
<button class="btn btn-primary">Run</button>
<div class="card bg-base-100 shadow-sm">
  <div class="card-body">
    <h2 class="card-title">Request</h2>
  </div>
</div>
```

### Incremental Migration

Existing t-req utilities and helper functions remain supported while you migrate:
- Existing Tailwind utility usage is unchanged
- Existing token classes like `bg-treq-bg`, `text-treq-text`, and `rounded-treq` remain available
- Existing utility helpers from `@t-req/ui` (for example `getButtonClasses`, `getMethodClasses`) continue to work

This lets you move component-by-component to DaisyUI without a flag day migration.

### Tailwind Config Compatibility

`@t-req/ui/tailwind` is still exported for compatibility:

```ts
// tailwind.config.ts
import type { Config } from "tailwindcss";
import treqConfig from "@t-req/ui/tailwind";

export default {
  ...treqConfig,
  content: [
    "./src/**/*.{ts,tsx}",
    // Add your content paths
  ],
} satisfies Config;
```

Note: DaisyUI itself is configured in `@t-req/ui/styles` via Tailwind v4 CSS plugins.

### Using Theme Colors Programmatically

Access theme colors in JavaScript/TypeScript:

```ts
import { themeColors } from "@t-req/ui";

// Use colors in your code
const getMethodColor = themeColors.http.get; // "#22c55e"
const postMethodColor = themeColors.http.post; // "#3b82f6"
```

## License

MIT
