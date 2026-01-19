import { createFetchTransport } from './fetch-transport';
import type { Transport } from './types';

type BunFetchInit = RequestInit & { tls?: { rejectUnauthorized: boolean }; proxy?: string };

function hasBun(): boolean {
  return typeof (globalThis as Record<string, unknown>)['Bun'] !== 'undefined';
}

/**
 * Auto-select a transport for the current runtime.
 *
 * - Bun: supports `proxy` and `validateSSL=false` via Bun fetch extensions.
 * - Others: falls back to baseline fetch transport (no proxy/validateSSL).
 */
export function createAutoTransport(): Transport {
  if (!hasBun()) {
    return createFetchTransport(fetch);
  }

  return {
    capabilities: { proxy: true, validateSSL: true },
    async fetch(url, init, ctx) {
      const bunInit: BunFetchInit = { ...(init ?? {}) };

      if (ctx.proxy !== undefined) {
        bunInit.proxy = ctx.proxy;
      }

      if (ctx.validateSSL === false) {
        bunInit.tls = { rejectUnauthorized: false };
      }

      return await fetch(url, bunInit);
    }
  };
}
