import type { Config } from 'tailwindcss';

/**
 * Shared t-req Tailwind CSS configuration
 * Warm industrial aesthetic with light and dark modes
 */
export default {
  content: [],
  theme: {
    extend: {
      colors: {
        treq: {
          // Light mode (default)
          bg: '#e8e4e0',
          'bg-nav': '#e8e4e0',
          'bg-card': '#f5f2ee',
          accent: '#ff6b35',
          'accent-light': '#ff8555',
          text: '#666666',
          'text-strong': '#000000',
          'text-muted': '#888888',
          border: '#000000',
          'border-light': 'rgba(0, 0, 0, 0.2)',
          // Dark mode
          'dark-bg': '#1a1816',
          'dark-bg-nav': '#1a1816',
          'dark-bg-card': '#222018',
          'dark-text': '#b0aca8',
          'dark-text-strong': '#e8e4e0',
          'dark-text-muted': '#8a8682',
          'dark-border': '#3a3632',
          'dark-border-light': 'rgba(232, 228, 224, 0.1)'
        },
        http: {
          get: '#238636',
          post: '#1f6feb',
          put: '#9e6a03',
          delete: '#da3633',
          patch: '#8957e5'
        }
      },
      fontFamily: {
        mono: [
          'JetBrains Mono',
          'ui-monospace',
          'SFMono-Regular',
          'SF Mono',
          'Menlo',
          'Consolas',
          'Liberation Mono',
          'monospace'
        ],
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Noto Sans',
          'Helvetica',
          'Arial',
          'sans-serif',
          'Apple Color Emoji',
          'Segoe UI Emoji'
        ]
      },
      borderRadius: {
        treq: '0.375rem',
        'treq-lg': '0.5rem'
      }
    }
  },
  plugins: []
} satisfies Config;
