/**
 * @t-req/ui - Shared UI components and Tailwind configuration
 *
 * Usage:
 * - Import styles: import "@t-req/ui/styles"
 * - Import Tailwind config: import config from "@t-req/ui/tailwind"
 * - Import components: import { ComponentName } from "@t-req/ui"
 */

export * from './components/index.js';

// Re-export theme colors for programmatic access
export const themeColors = {
  treq: {
    bg: '#0d1117',
    bgNav: '#161b22',
    accent: '#4f8cff',
    accentLight: '#7aa8ff',
    text: '#e6edf3',
    textMuted: '#8b949e',
    border: '#30363d'
  },
  http: {
    get: '#238636',
    post: '#1f6feb',
    put: '#9e6a03',
    delete: '#da3633',
    patch: '#8957e5'
  }
} as const;

export type ThemeColors = typeof themeColors;
