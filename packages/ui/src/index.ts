/**
 * @t-req/ui - Shared UI components and Tailwind configuration
 *
 * Usage:
 * - Import styles: import "@t-req/ui/styles"
 * - Import Tailwind config: import config from "@t-req/ui/tailwind"
 * - Import components: import { ComponentName } from "@t-req/ui"
 */

export * from './accessibility/index.js';
export * from './components/index.js';

// Re-export theme colors for programmatic access
export const themeColors = {
  treq: {
    bg: '#ffffff',
    bgNav: '#ffffff',
    bgCard: '#f8fafc',
    accent: '#f97316',
    accentLight: '#fb923c',
    text: '#334155',
    textStrong: '#0f172a',
    textMuted: '#64748b',
    border: '#1e293b',
    borderLight: '#e2e8f0',
    // Dark mode
    darkBg: '#18181b',
    darkBgNav: '#18181b',
    darkBgCard: '#1f1f23',
    darkText: '#a1a1aa',
    darkTextStrong: '#fafafa',
    darkTextMuted: '#71717a',
    darkBorder: '#27272a',
    darkBorderLight: '#27272a'
  },
  http: {
    get: '#22c55e',
    post: '#3b82f6',
    put: '#eab308',
    delete: '#ef4444',
    patch: '#a855f7'
  }
} as const;

export type ThemeColors = typeof themeColors;
