import type { Config } from 'tailwindcss';

/**
 * Shared t-req Tailwind CSS configuration
 * Modern developer-focused aesthetic with light and dark modes
 *
 * DaisyUI is configured in `src/styles/base.css` using Tailwind v4 CSS plugins.
 * This file stays exported for backwards compatibility with existing consumers.
 */
export default {
  content: [],
  theme: {
    extend: {
      colors: {
        treq: {
          // Light mode (default) - Clean white aesthetic
          bg: '#ffffff',
          'bg-nav': '#ffffff',
          'bg-card': '#f8fafc',
          accent: '#f97316',
          'accent-light': '#fb923c',
          text: '#334155',
          'text-strong': '#0f172a',
          'text-muted': '#64748b',
          border: '#1e293b',
          'border-light': '#e2e8f0',
          // Dark mode - Neutral zinc scale
          'dark-bg': '#18181b',
          'dark-bg-nav': '#18181b',
          'dark-bg-card': '#1f1f23',
          'dark-text': '#a1a1aa',
          'dark-text-strong': '#fafafa',
          'dark-text-muted': '#71717a',
          'dark-border': '#27272a',
          'dark-border-light': '#27272a'
        },
        http: {
          get: '#22c55e',
          post: '#3b82f6',
          put: '#eab308',
          delete: '#ef4444',
          patch: '#a855f7'
        }
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace']
      },
      fontSize: {
        'heading-1': [
          '2.25rem',
          { lineHeight: '1.2', letterSpacing: '-0.04em', fontWeight: '800' }
        ],
        'heading-2': [
          '1.5rem',
          { lineHeight: '1.2', letterSpacing: '-0.025em', fontWeight: '700' }
        ],
        'heading-3': [
          '1.25rem',
          { lineHeight: '1.2', letterSpacing: '-0.025em', fontWeight: '700' }
        ],
        body: ['1rem', { lineHeight: '1.75', fontWeight: '400' }],
        small: ['0.875rem', { lineHeight: '1.5', fontWeight: '400' }],
        code: ['0.8125rem', { lineHeight: '1.7', fontWeight: '400' }]
      },
      borderRadius: {
        treq: '0.5rem',
        'treq-lg': '0.75rem'
      },
      transitionDuration: {
        DEFAULT: '150ms'
      }
    }
  },
  plugins: []
} satisfies Config;
