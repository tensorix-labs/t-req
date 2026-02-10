import { describe, expect, test } from 'bun:test';
import { type PipelineConfig, prepareRequest } from '../src/engine/request-pipeline';
import { createInterpolator } from '../src/interpolate';
import type { HookContext } from '../src/plugin/types';
import type { EngineEvent } from '../src/runtime/types';
import type { ParsedRequest } from '../src/types';

function makeHookCtx(overrides?: Partial<HookContext>): HookContext {
  return {
    retries: 0,
    maxRetries: 3,
    session: { id: 'default', variables: {}, reports: [] },
    variables: {},
    config: {
      projectRoot: '.',
      variables: {},
      security: { allowExternalFiles: false, allowPluginsOutsideProject: false }
    },
    projectRoot: '.',
    report: () => {},
    ...overrides
  };
}

function makeRequest(overrides?: Partial<ParsedRequest>): ParsedRequest {
  return {
    method: 'GET',
    url: 'https://example.com',
    headers: {},
    raw: 'GET https://example.com\n',
    meta: {},
    ...overrides
  };
}

function makeConfig(overrides?: Partial<PipelineConfig>): PipelineConfig {
  return {
    interpolator: createInterpolator({ resolvers: {} }),
    emitEvent: () => {},
    ...overrides
  };
}

describe('prepareRequest', () => {
  test('interpolates variables in URL and headers', async () => {
    const config = makeConfig();
    const request = makeRequest({
      url: 'https://{{host}}/api',
      headers: { Authorization: 'Bearer {{token}}' },
      raw: 'GET https://{{host}}/api\nAuthorization: Bearer {{token}}\n'
    });

    const result = await prepareRequest(
      config,
      request,
      { host: 'api.example.com', token: 'my-secret' },
      '/app',
      makeHookCtx()
    );

    expect(result.skipped).toBe(false);
    expect(result.requestWithCookies.url).toBe('https://api.example.com/api');
    expect(result.requestWithCookies.headers?.['Authorization']).toBe('Bearer my-secret');
  });

  test('injects cookie header from cookie store', async () => {
    const cookieStore = {
      getCookieHeader: async (_url: string) => 'session=abc123',
      setFromResponse: async () => {}
    };

    const config = makeConfig({ cookieStore });
    const request = makeRequest();

    const result = await prepareRequest(config, request, {}, '/app', makeHookCtx());

    expect(result.requestWithCookies.headers?.['Cookie']).toBe('session=abc123');
  });

  test('merges cookie header with existing cookies', async () => {
    const cookieStore = {
      getCookieHeader: async (_url: string) => 'session=abc123',
      setFromResponse: async () => {}
    };

    const config = makeConfig({ cookieStore });
    const request = makeRequest({
      headers: { Cookie: 'existing=value' }
    });

    const result = await prepareRequest(config, request, {}, '/app', makeHookCtx());

    expect(result.requestWithCookies.headers?.['Cookie']).toBe('existing=value; session=abc123');
  });

  test('works without cookie store', async () => {
    const config = makeConfig();
    const request = makeRequest();

    const result = await prepareRequest(config, request, {}, '/app', makeHookCtx());

    expect(result.requestWithCookies.headers?.['Cookie']).toBeUndefined();
  });

  test('emits interpolation and compile events', async () => {
    const events: EngineEvent[] = [];
    const config = makeConfig({
      emitEvent: (event) => events.push(event)
    });
    const request = makeRequest();

    await prepareRequest(config, request, {}, '/app', makeHookCtx());

    const types = events.map((e) => e.type);
    expect(types).toContain('interpolateStarted');
    expect(types).toContain('interpolateFinished');
    expect(types).toContain('compileStarted');
    expect(types).toContain('compileFinished');
  });

  test('applies header defaults through pipeline', async () => {
    const config = makeConfig({
      headerDefaults: { 'User-Agent': 'treq/1.0' }
    });
    const request = makeRequest();

    const result = await prepareRequest(config, request, {}, '/app', makeHookCtx());

    expect(result.requestWithCookies.headers?.['User-Agent']).toBe('treq/1.0');
  });

  test('returns mergedVars with variables copy', async () => {
    const config = makeConfig();
    const request = makeRequest();
    const variables = { key: 'value' };

    const result = await prepareRequest(config, request, variables, '/app', makeHookCtx());

    expect(result.mergedVars).toEqual({ key: 'value' });
    // Should be a copy, not the same reference
    expect(result.mergedVars).not.toBe(variables);
  });

  test('sets urlForCookies from compiled request URL', async () => {
    const config = makeConfig();
    const request = makeRequest({
      url: 'https://{{host}}/path',
      raw: 'GET https://{{host}}/path\n'
    });

    const result = await prepareRequest(
      config,
      request,
      { host: 'api.example.com' },
      '/app',
      makeHookCtx()
    );

    expect(result.urlForCookies).toBe('https://api.example.com/path');
  });

  test('no-plugin-manager case succeeds without hooks', async () => {
    const config = makeConfig({});
    const request = makeRequest();

    const result = await prepareRequest(config, request, {}, '/app', makeHookCtx());

    expect(result.skipped).toBe(false);
    expect(result.requestWithCookies.method).toBe('GET');
    expect(result.requestWithCookies.url).toBe('https://example.com');
  });
});
