# @t-req/ui

Shared UI components and Tailwind CSS configuration for t-req applications. Provides a warm industrial aesthetic with light and dark mode support.

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
- Tailwind CSS base styles
- t-req theme CSS variables
- Light and dark mode color tokens

### Importing Tailwind Config

Extend your Tailwind configuration with the t-req theme:

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

### Using Theme Colors Programmatically

Access theme colors in JavaScript/TypeScript:

```ts
import { themeColors } from "@t-req/ui";

// Use colors in your code
const getMethodColor = themeColors.http.get; // "#238636"
const postMethodColor = themeColors.http.post; // "#1f6feb"
```

### Importing Fonts

For JetBrains Mono font support:

```ts
import "@t-req/ui/fonts";
```

## Theme Reference

### Light Mode Colors

| Token | Value | Usage |
|-------|-------|-------|
| `treq-bg` | `#e8e4e0` | Main background |
| `treq-bg-nav` | `#e8e4e0` | Navigation background |
| `treq-bg-card` | `#f5f2ee` | Card/panel background |
| `treq-accent` | `#ff6b35` | Primary accent |
| `treq-accent-light` | `#ff8555` | Light accent variant |
| `treq-text` | `#666666` | Body text |
| `treq-text-strong` | `#000000` | Headings, emphasis |
| `treq-text-muted` | `#888888` | Secondary text |
| `treq-border` | `#000000` | Primary borders |
| `treq-border-light` | `rgba(0, 0, 0, 0.2)` | Subtle borders |

### Dark Mode Colors

| Token | Value | Usage |
|-------|-------|-------|
| `treq-dark-bg` | `#1a1816` | Main background |
| `treq-dark-bg-nav` | `#1a1816` | Navigation background |
| `treq-dark-bg-card` | `#222018` | Card/panel background |
| `treq-dark-text` | `#b0aca8` | Body text |
| `treq-dark-text-strong` | `#e8e4e0` | Headings, emphasis |
| `treq-dark-text-muted` | `#8a8682` | Secondary text |
| `treq-dark-border` | `#3a3632` | Primary borders |
| `treq-dark-border-light` | `rgba(232, 228, 224, 0.1)` | Subtle borders |

### HTTP Method Colors

| Method | Color | Hex |
|--------|-------|-----|
| GET | Green | `#238636` |
| POST | Blue | `#1f6feb` |
| PUT | Orange | `#9e6a03` |
| DELETE | Red | `#da3633` |
| PATCH | Purple | `#8957e5` |

## Tailwind Classes

Use the theme colors in your Tailwind classes:

```html
<!-- Backgrounds -->
<div class="bg-treq-bg dark:bg-treq-dark-bg">

<!-- Text -->
<p class="text-treq-text dark:text-treq-dark-text">

<!-- HTTP method badges -->
<span class="bg-http-get text-white">GET</span>
<span class="bg-http-post text-white">POST</span>
<span class="bg-http-delete text-white">DELETE</span>
```

## License

MIT
