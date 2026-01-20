import type { Hono } from 'hono';

/**
 * In-process Hono server testing helper.
 * Uses app.request() for testing without network I/O.
 */
export interface TestServer {
  /**
   * Make a request to the test server.
   */
  request(path: string, init?: RequestInit): Promise<unknown>;

  /**
   * Make a GET request with JSON response parsing.
   */
  get<T = unknown>(path: string, init?: RequestInit): Promise<{ status: number; data: T }>;

  /**
   * Make a POST request with JSON body and response.
   */
  post<T = unknown>(
    path: string,
    body: unknown,
    init?: RequestInit
  ): Promise<{ status: number; data: T }>;

  /**
   * Make a PUT request with JSON body and response.
   */
  put<T = unknown>(
    path: string,
    body: unknown,
    init?: RequestInit
  ): Promise<{ status: number; data: T }>;

  /**
   * Make a DELETE request.
   */
  delete(path: string, init?: RequestInit): Promise<{ status: number }>;
}

/**
 * Create a test server wrapper around a Hono app.
 * Allows testing routes without starting a real HTTP server.
 */
/**
 * We only rely on `app.request()`. Avoid typing this as full `Hono` because
 * `OpenAPIHono` (from `@hono/zod-openapi`) has a different `Env` constraint
 * on `request()` and TS will reject assignment due to function parameter variance.
 */
type RequestApp = {
  request: (
    input: Parameters<Hono['request']>[0],
    requestInit?: Parameters<Hono['request']>[1],
    // Match OpenAPIHono's constraint: `Env?: object | {} | undefined`
    Env?: object | Record<never, never> | undefined,
    executionCtx?: Parameters<Hono['request']>[3]
  ) => ReturnType<Hono['request']>;
};

export function createTestServer(app: RequestApp): TestServer {
  const baseUrl = 'http://localhost';

  type ResponseLike = { status: number; json: () => Promise<unknown> };

  return {
    async request(path: string, init?: RequestInit): Promise<unknown> {
      const url = new URL(path, baseUrl);
      return await app.request(url.toString(), init);
    },

    async get<T = unknown>(path: string, init?: RequestInit): Promise<{ status: number; data: T }> {
      const response = (await this.request(path, { ...init, method: 'GET' })) as ResponseLike;
      const data = response.status !== 204 ? ((await response.json()) as T) : (undefined as T);
      return { status: response.status, data };
    },

    async post<T = unknown>(
      path: string,
      body: unknown,
      init?: RequestInit
    ): Promise<{ status: number; data: T }> {
      const response = (await this.request(path, {
        ...init,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...init?.headers
        },
        body: JSON.stringify(body)
      })) as ResponseLike;
      const data = response.status !== 204 ? ((await response.json()) as T) : (undefined as T);
      return { status: response.status, data };
    },

    async put<T = unknown>(
      path: string,
      body: unknown,
      init?: RequestInit
    ): Promise<{ status: number; data: T }> {
      const response = (await this.request(path, {
        ...init,
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...init?.headers
        },
        body: JSON.stringify(body)
      })) as ResponseLike;
      const data = response.status !== 204 ? ((await response.json()) as T) : (undefined as T);
      return { status: response.status, data };
    },

    async delete(path: string, init?: RequestInit): Promise<{ status: number }> {
      const response = (await this.request(path, { ...init, method: 'DELETE' })) as ResponseLike;
      return { status: response.status };
    }
  };
}
