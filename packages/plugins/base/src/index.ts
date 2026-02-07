import { definePlugin } from '@t-req/core/plugin';

/**
 * Base plugin providing essential resolvers for t-req.
 *
 * Bundled with the CLI for zero-friction onboarding,
 * but must be explicitly enabled in treq.jsonc:
 *
 *   "plugins": ["@t-req/plugin-base"]
 */
export const base = definePlugin({
  name: 'base',
  version: '0.0.1',
  permissions: ['env'],
  resolvers: {
    $env: (key: string) => process.env[key] ?? '',

    // UUID
    $uuid: () => crypto.randomUUID(),

    // Timestamps
    $timestamp: () => String(Math.floor(Date.now() / 1000)),
    $timestampMs: () => String(Date.now()),
    $isodate: () => new Date().toISOString(),

    // Random
    $randomInt: (min: string, max: string) => {
      const lo = Number(min);
      const hi = Number(max);
      return String(Math.floor(Math.random() * (hi - lo + 1)) + lo);
    },

    // Encoding
    $base64: (value: string) => btoa(value),
    $base64Decode: (value: string) => atob(value)
  }
});

export default base;
