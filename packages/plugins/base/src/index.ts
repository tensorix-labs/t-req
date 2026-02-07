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
  version: '0.0.0',
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
      const lo = Math.floor(Number(min));
      const hi = Math.floor(Number(max));
      return String(Math.floor(Math.random() * (hi - lo + 1)) + lo);
    },

    // Encoding
    $base64: (value: string) => Buffer.from(value, 'utf8').toString('base64'),
    $base64Decode: (value: string) => Buffer.from(value, 'base64').toString('utf8')
  }
});

export default base;
