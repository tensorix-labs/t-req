import type { Transport } from './types';

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function unsupported(name: string): never {
  throw new Error(
    `${name} is not supported by this transport. Provide a transport that supports it.`
  );
}

/**
 * Create a minimal transport backed by a standard fetch implementation.
 * This transport is renderer-safe and works in Node 18+, Bun, and webviews.
 *
 * Note: proxy and validateSSL are not supported by baseline fetch.
 */
export function createFetchTransport(fetchImpl: FetchLike = fetch): Transport {
  return {
    capabilities: { proxy: false, validateSSL: false },
    async fetch(url, init, ctx) {
      if (ctx.proxy) unsupported('proxy');
      if (ctx.validateSSL === false) unsupported('validateSSL=false');
      return await fetchImpl(url, init);
    }
  };
}
