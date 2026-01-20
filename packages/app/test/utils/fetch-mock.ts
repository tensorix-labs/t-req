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

/**
 * Creates a mock response with common defaults.
 */
export type MockResponseInit = {
  status?: number;
  statusText?: string;
  // Keep this intentionally loose: some TS configs in this repo don't include DOM fetch lib types.
  headers?: unknown;
  setCookies?: string[];
};

export function mockResponse(body: string | object, init?: MockResponseInit): Response {
  const bodyString = typeof body === 'object' ? JSON.stringify(body) : body;
  const contentType = typeof body === 'object' ? 'application/json' : 'text/plain';

  const headers = new Headers(init?.headers as never) as unknown as {
    get?: (name: string) => string | null;
    set?: (name: string, value: string) => void;
    append?: (name: string, value: string) => void;
  };
  const existing = typeof headers.get === 'function' ? headers.get('content-type') : null;
  if (!existing) {
    if (typeof headers.set === 'function') headers.set('content-type', contentType);
    else if (typeof headers.append === 'function') headers.append('content-type', contentType);
  }

  const response = new Response(bodyString, {
    status: init?.status,
    statusText: init?.statusText,
    headers: headers as never
  } as never);

  // Handle set-cookie headers for Bun compatibility
  if (init?.setCookies && init.setCookies.length > 0) {
    // Bun's Response supports getSetCookie() method
    const originalHeaders = response.headers;
    (originalHeaders as unknown as { getSetCookie: () => string[] }).getSetCookie = () =>
      init.setCookies ?? [];
  }

  return response;
}

/**
 * Creates a delayed mock response for timeout testing.
 */
export function delayedResponse(
  body: string | object,
  delayMs: number,
  init?: MockResponseInit
): Promise<Response> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(mockResponse(body, init));
    }, delayMs);
  });
}
