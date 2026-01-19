/**
 * Creates a properly-typed fetch mock that satisfies Bun's fetch type.
 * Bun's fetch includes a `preconnect` namespace property that plain functions don't have.
 */
export function createFetchMock(
  impl: (url: string | URL | Request, init?: RequestInit) => Promise<Response>
): typeof fetch {
  return Object.assign(impl, {
    preconnect: (_url: string | URL) => {}
  }) as typeof fetch;
}

/**
 * Installs a fetch mock and returns a restore function.
 */
export function installFetchMock(
  impl: (url: string | URL | Request, init?: RequestInit) => Promise<Response>
): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = createFetchMock(impl);
  return () => {
    globalThis.fetch = original;
  };
}
