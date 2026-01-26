import type { CookieJar } from 'tough-cookie';
import type { EventSink, IO, Transport } from './runtime/types';

// ============================================================================
// Parsed Request
// ============================================================================

/**
 * Represents a file reference in request body using `< ./path` syntax.
 *
 * @example
 * ```typescript
 * const fileRef: FileReference = {
 *   path: './fixtures/payload.json'
 * };
 * ```
 */
export interface FileReference {
  /** Relative path to the file */
  path: string;
}

/**
 * Represents a field in form data body.
 *
 * @example
 * ```typescript
 * // Text field
 * const textField: FormField = {
 *   name: 'title',
 *   value: 'My Document',
 *   isFile: false,
 * };
 *
 * // File field
 * const fileField: FormField = {
 *   name: 'document',
 *   value: '',
 *   isFile: true,
 *   path: './uploads/doc.pdf',
 *   filename: 'report.pdf', // optional custom filename
 * };
 * ```
 */
export interface FormField {
  /** Field name */
  name: string;
  /** Text value (for non-file fields) */
  value: string;
  /** Whether this field is a file upload */
  isFile: boolean;
  /** File path if isFile is true (from @./path syntax) */
  path?: string;
  /** Custom filename for file upload (from | syntax) */
  filename?: string;
}

/**
 * Represents a parsed HTTP request from a .http file.
 *
 * @example
 * ```typescript
 * const request: ParsedRequest = {
 *   name: 'getUsers',
 *   method: 'GET',
 *   url: 'https://api.example.com/users',
 *   headers: { 'Authorization': 'Bearer token' },
 *   body: undefined,
 *   raw: 'GET https://api.example.com/users\nAuthorization: Bearer token',
 *   meta: { timeout: '5000' }
 * };
 * ```
 */
export interface ParsedRequest {
  /** Optional name for the request, from `### Name` or `# @name name` */
  name?: string;
  /** HTTP method (GET, POST, PUT, DELETE, PATCH, etc.) */
  method: string;
  /** Full URL including any query parameters */
  url: string;
  /** Request headers as key-value pairs */
  headers: Record<string, string>;
  /** Request body content (for POST, PUT, PATCH requests) */
  body?: string;
  /** File reference if body uses `< ./path` syntax */
  bodyFile?: FileReference;
  /** Form fields if body uses form data syntax (field = value) */
  formData?: FormField[];
  /** Original raw content of the request block */
  raw: string;
  /** Meta directives from comments like `# @directive value` */
  meta: Record<string, string>;
}

// ============================================================================
// Interpolation
// ============================================================================

/**
 * A function that resolves dynamic values during interpolation.
 * Receives zero or more string arguments from the template.
 *
 * @example
 * ```typescript
 * const envResolver: Resolver = (key) => process.env[key] || '';
 * const randomResolver: Resolver = (min = '0', max = '100') =>
 *   String(Math.floor(Math.random() * (Number(max) - Number(min) + 1)) + Number(min));
 * ```
 */
export type Resolver = (...args: string[]) => string | Promise<string>;

/**
 * Configuration options for variable interpolation.
 */
export interface InterpolateOptions {
  /**
   * Custom resolvers for dynamic values like `{{$env(KEY)}}`.
   * Resolver names must start with `$`.
   *
   * @example
   * ```typescript
   * {
   *   resolvers: {
   *     $env: (key) => process.env[key] || '',
   *     $timestamp: () => String(Date.now()),
   *   }
   * }
   * ```
   */
  resolvers?: Record<string, Resolver>;

  /**
   * How to handle undefined variables.
   * - `'throw'`: Throw an error (default)
   * - `'keep'`: Keep the `{{variable}}` placeholder
   * - `'empty'`: Replace with empty string
   */
  undefinedBehavior?: 'throw' | 'keep' | 'empty';
}

/**
 * A reusable interpolator instance with async support.
 * Created using `createInterpolator()`.
 */
export interface Interpolator {
  /**
   * Interpolate variables in a target string or object.
   * Supports async resolvers.
   */
  interpolate<T>(target: T, variables: Record<string, unknown>): Promise<T>;
}

// ============================================================================
// Execution
// ============================================================================

/**
 * Request object for HTTP execution.
 * This is the minimal representation needed to execute a request.
 */
export interface ExecuteRequest {
  /** HTTP method */
  method: string;
  /** Full URL to request */
  url: string;
  /** Request headers */
  headers?: Record<string, string>;
  /** Request body (string, ArrayBuffer, FormData, or URLSearchParams) */
  body?: string | ArrayBuffer | FormData | URLSearchParams;
}

/**
 * Options for HTTP request execution (internal use).
 */
export interface ExecuteOptions {
  /**
   * Request timeout in milliseconds.
   * @default 30000
   */
  timeout?: number;

  /**
   * AbortSignal for cancellation. Takes precedence over timeout.
   */
  signal?: AbortSignal;

  /**
   * Whether to automatically follow redirects.
   * @default true
   */
  followRedirects?: boolean;

  /**
   * Whether to validate SSL certificates.
   * Set to false for self-signed certificates.
   * @default true
   */
  validateSSL?: boolean;

  /**
   * Proxy URL to use for requests.
   * @example 'http://proxy.example.com:8080'
   */
  proxy?: string;
}

// ============================================================================
// Cookies
// ============================================================================

// Cookie handling is powered by `tough-cookie`.
// The public cookie APIs are exported from `src/cookies.ts`.

// ============================================================================
// Client
// ============================================================================

/**
 * Configuration for creating an HTTP client.
 */
export interface ClientConfig {
  /**
   * Variables available to all requests.
   * Can be overridden per-request.
   */
  variables?: Record<string, unknown>;

  /**
   * Custom resolvers for dynamic values.
   * @see InterpolateOptions.resolvers
   */
  resolvers?: Record<string, Resolver>;

  /**
   * Cookie jar for automatic cookie handling.
   * Create with `createCookieJar()`.
   */
  cookieJar?: CookieJar;

  /**
   * Optional IO adapter for filesystem access (Node/Bun/Tauri).
   * Required for `client.run(path)` in runtimes without Bun filesystem APIs.
   */
  io?: IO;

  /**
   * Optional transport adapter to control how requests are executed.
   */
  transport?: Transport;

  /**
   * Optional event sink for engine-style observability (useful for TUI/agent UX).
   */
  onEvent?: EventSink;

  /**
   * Default timeout in milliseconds for all requests.
   * Can be overridden per-request.
   * @default 30000
   */
  timeout?: number;

  /**
   * Default settings for all requests.
   */
  defaults?: {
    /** Default headers to include */
    headers?: Record<string, string>;
    /** Whether to follow redirects */
    followRedirects?: boolean;
    /** Whether to validate SSL certificates */
    validateSSL?: boolean;
    /** Proxy URL */
    proxy?: string;
  };

  // ============================================================================
  // Server mode options (enables remote execution when set)
  // ============================================================================

  /**
   * Server URL to route requests through.
   * When set, the client operates in "server mode" - requests are executed
   * by the treq server instead of locally.
   *
   * If not provided, will try to read from TREQ_SERVER environment variable.
   *
   * @example 'http://localhost:4096'
   */
  server?: string;

  /**
   * Bearer token for server authentication.
   * If not provided, will try to read from TREQ_TOKEN environment variable.
   */
  serverToken?: string;

  /**
   * Server-side config profile to use.
   * Selects a named profile from the server's treq.jsonc configuration.
   */
  profile?: string;
}

/**
 * Options for running a request.
 */
export interface RunOptions {
  /** Additional variables for this request */
  variables?: Record<string, unknown>;
  /**
   * Timeout in milliseconds for this request.
   * Converted to AbortSignal internally.
   */
  timeout?: number;
  /**
   * AbortSignal for cancellation.
   * Takes precedence over timeout if both provided.
   */
  signal?: AbortSignal;

  /**
   * Base path for resolving file references when using `runString`.
   * Ignored by `run(path)`, which derives base path from the .http file location.
   */
  basePath?: string;
}

/**
 * High-level HTTP client with variable interpolation and cookies.
 *
 * @example
 * ```typescript
 * const client = createClient({
 *   variables: { baseUrl: 'https://api.example.com' },
 *   cookieJar: createCookieJar(),
 * });
 *
 * // Run a request from a .http file
 * const res = await client.run('./auth/login.http');
 * const { token } = await res.json();
 *
 * // Set variable for subsequent requests
 * client.setVariable('token', token);
 *
 * // Run another request
 * const profile = await client.run('./users/profile.http');
 *
 * // Clean up when done
 * await client.close();
 * ```
 *
 * @example Using explicit resource management (TypeScript 5.2+)
 * ```typescript
 * await using client = createClient({ server: 'http://localhost:4096' });
 * const res = await client.run('./auth/login.http');
 * // client.close() is called automatically when scope exits
 * ```
 */
export interface Client {
  /**
   * Parse and execute a request from a .http file.
   * Returns a native fetch Response.
   *
   * @param path Path to the .http file
   * @param options Optional variables, timeout, or abort signal
   */
  run(path: string, options?: RunOptions): Promise<Response>;

  /**
   * Parse and execute a request from in-memory `.http` content.
   * Useful for editors, TUI previews, and Tauri renderer execution.
   */
  runString(content: string, options?: RunOptions): Promise<Response>;

  /** Merge new variables with existing ones */
  setVariables(vars: Record<string, unknown>): void;

  /** Set a single variable */
  setVariable(key: string, value: unknown): void;

  /** Get a copy of all current variables */
  getVariables(): Record<string, unknown>;

  /**
   * Close the client and release any resources.
   * - For local clients: no-op
   * - For server clients: finishes the flow (best-effort)
   */
  close(): Promise<void>;

  /**
   * Async dispose for explicit resource management (TypeScript 5.2+).
   * Equivalent to calling `close()`.
   */
  [Symbol.asyncDispose](): Promise<void>;
}
