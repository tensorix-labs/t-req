import type { CookieJar } from 'tough-cookie';
import type { EngineConfig, EngineRunOptions } from './engine/engine';
import { createEngine } from './engine/engine';
import type { CookieStore } from './runtime/types';
import type { Client, ClientConfig, RunOptions } from './types';
import { setOptional } from './utils/optional';

/**
 * Create a high-level HTTP client
 */
export function createClient(config: ClientConfig = {}): Client {
  let variables: Record<string, unknown> = { ...config.variables };
  const cookieJar = config.cookieJar;
  const defaultTimeout = config.timeout ?? 30000;
  const defaults = config.defaults || {};

  const cookieStore = cookieJar ? cookieJarToStore(cookieJar) : undefined;

  const engine = createEngine(
    setOptional<EngineConfig>({} as EngineConfig)
      .ifDefined('io', config.io)
      .ifDefined('transport', config.transport)
      .ifDefined('cookieStore', cookieStore)
      .ifDefined('resolvers', config.resolvers)
      .ifDefined('onEvent', config.onEvent)
      .ifDefined('headerDefaults', defaults.headers)
      .build()
  );

  function mergedVars(runVars?: Record<string, unknown>): Record<string, unknown> {
    return { ...variables, ...runVars };
  }

  return {
    async run(filePath: string, options: RunOptions = {}): Promise<Response> {
      return await engine.runFile(
        filePath,
        setOptional<EngineRunOptions>({
          variables: mergedVars(options.variables),
          timeoutMs: options.timeout ?? defaultTimeout
        })
          .ifDefined('signal', options.signal)
          .ifDefined('followRedirects', defaults.followRedirects)
          .ifDefined('validateSSL', defaults.validateSSL)
          .ifDefined('proxy', defaults.proxy)
          .build()
      );
    },

    async runString(content: string, options: RunOptions = {}): Promise<Response> {
      return await engine.runString(
        content,
        setOptional<EngineRunOptions>({
          variables: mergedVars(options.variables),
          timeoutMs: options.timeout ?? defaultTimeout
        })
          .ifDefined('signal', options.signal)
          .ifDefined('followRedirects', defaults.followRedirects)
          .ifDefined('validateSSL', defaults.validateSSL)
          .ifDefined('proxy', defaults.proxy)
          .ifDefined('basePath', options.basePath)
          .build()
      );
    },

    setVariables(vars: Record<string, unknown>): void {
      variables = { ...variables, ...vars };
    },

    setVariable(key: string, value: unknown): void {
      variables[key] = value;
    },

    getVariables(): Record<string, unknown> {
      return { ...variables };
    }
  };
}

function cookieJarToStore(cookieJar: CookieJar): CookieStore {
  return {
    getCookieHeader(url: string) {
      try {
        const v = cookieJar.getCookieStringSync(url);
        return v || undefined;
      } catch {
        return undefined;
      }
    },
    setFromResponse(url: string, response: Response) {
      const setCookieHeaders = getSetCookieHeaders(response);
      for (const header of setCookieHeaders) {
        cookieJar.setCookieSync(header, url, { ignoreError: true });
      }
    }
  };
}

function getSetCookieHeaders(response: Response): string[] {
  const anyHeaders = response.headers as unknown as { getSetCookie?: () => string[] };
  const fromGetSetCookie = anyHeaders.getSetCookie?.();
  if (Array.isArray(fromGetSetCookie) && fromGetSetCookie.length > 0) return fromGetSetCookie;

  const single = response.headers.get('set-cookie');
  return single ? [single] : [];
}
