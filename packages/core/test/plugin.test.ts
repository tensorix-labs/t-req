import { afterEach, describe, expect, test } from 'bun:test';
import { createEngine } from '../src/engine/engine';
import { definePlugin } from '../src/plugin/define';
import { PluginManager } from '../src/plugin/manager';
import type { PluginPermission, TreqPlugin } from '../src/plugin/types';
import { createFetchTransport } from '../src/runtime/fetch-transport';

// ============================================================================
// Test Utilities
// ============================================================================

function installFetchMock(
  impl: (url: string | URL | Request, init?: RequestInit) => Promise<Response>
): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = Object.assign(impl, { preconnect: () => {} }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

async function createPluginManager(
  plugins: TreqPlugin[],
  options: { permissions?: Record<string, PluginPermission[]> } = {}
): Promise<PluginManager> {
  const manager = new PluginManager({
    projectRoot: '/test',
    plugins,
    ...(options.permissions !== undefined ? { pluginPermissions: options.permissions } : {})
  });

  await manager.initialize();
  return manager;
}

// ============================================================================
// Plugin Hook Behavior Tests
// ============================================================================

describe('Plugin System - Hook Behavior', () => {
  let restore: (() => void) | null = null;

  afterEach(() => {
    restore?.();
    restore = null;
  });

  test('request.before hook can modify request headers', async () => {
    let capturedHeaders: Record<string, string> | undefined;

    restore = installFetchMock(async (_url, init) => {
      capturedHeaders = init?.headers as Record<string, string>;
      return new Response('{}', { status: 200 });
    });

    const plugin = definePlugin({
      name: 'test-header-modifier',
      hooks: {
        'request.before': async (_input, output) => {
          output.request = {
            ...output.request,
            headers: {
              ...output.request.headers,
              'X-Custom-Header': 'plugin-added'
            }
          };
        }
      }
    });

    const pluginManager = await createPluginManager([plugin]);

    const engine = createEngine({
      transport: createFetchTransport(fetch),
      pluginManager
    });

    await engine.runString('GET https://api.example.com/test\n');

    expect(capturedHeaders?.['X-Custom-Header']).toBe('plugin-added');
  });

  test('request.before hook can skip request', async () => {
    let fetchCalled = false;

    restore = installFetchMock(async () => {
      fetchCalled = true;
      return new Response('{}', { status: 200 });
    });

    const plugin = definePlugin({
      name: 'test-skip',
      hooks: {
        'request.before': async (_input, output) => {
          output.skip = true;
        }
      }
    });

    const pluginManager = await createPluginManager([plugin]);

    const engine = createEngine({
      transport: createFetchTransport(fetch),
      pluginManager
    });

    const response = await engine.runString('GET https://api.example.com/test\n');

    expect(fetchCalled).toBe(false);
    expect(response.status).toBe(204); // Skipped response
  });

  test('request.compiled hook runs after variable interpolation', async () => {
    let capturedUrl: string | undefined;
    let hookReceivedUrl: string | undefined;

    restore = installFetchMock(async (url) => {
      capturedUrl = String(url);
      return new Response('{}', { status: 200 });
    });

    const plugin = definePlugin({
      name: 'test-compiled-hook',
      hooks: {
        'request.compiled': async (input, _output) => {
          // At this point, variables should be interpolated
          hookReceivedUrl = input.request.url;
        }
      }
    });

    const pluginManager = await createPluginManager([plugin]);

    const engine = createEngine({
      transport: createFetchTransport(fetch),
      pluginManager
    });

    await engine.runString('GET https://{{host}}/api\n', {
      variables: { host: 'api.example.com' }
    });

    expect(hookReceivedUrl).toBe('https://api.example.com/api');
    expect(capturedUrl).toBe('https://api.example.com/api');
  });

  test('request.compiled hook can modify request for signing', async () => {
    let capturedHeaders: Record<string, string> | undefined;

    restore = installFetchMock(async (_url, init) => {
      capturedHeaders = init?.headers as Record<string, string>;
      return new Response('{}', { status: 200 });
    });

    const plugin = definePlugin({
      name: 'test-signer',
      hooks: {
        'request.compiled': async (input, output) => {
          // Simulate request signing based on final URL
          const signature = `sig-${input.request.url.length}`;
          output.request = {
            ...output.request,
            headers: {
              ...output.request.headers,
              Authorization: `Signature ${signature}`
            }
          };
        }
      }
    });

    const pluginManager = await createPluginManager([plugin]);

    const engine = createEngine({
      transport: createFetchTransport(fetch),
      pluginManager
    });

    await engine.runString('GET https://api.example.com/test\n');

    expect(capturedHeaders?.['Authorization']).toMatch(/^Signature sig-\d+$/);
  });

  test('request.after hook is read-only and observes final request', async () => {
    let observedRequest: { method: string; url: string } | undefined;

    restore = installFetchMock(async () => {
      return new Response('{}', { status: 200 });
    });

    const plugin = definePlugin({
      name: 'test-observer',
      hooks: {
        'request.after': async (input) => {
          // This hook has no output - it's for observation only
          observedRequest = {
            method: input.request.method,
            url: input.request.url
          };
        }
      }
    });

    const pluginManager = await createPluginManager([plugin]);

    const engine = createEngine({
      transport: createFetchTransport(fetch),
      pluginManager
    });

    await engine.runString('POST https://api.example.com/submit\n\n{"data": "test"}');

    expect(observedRequest?.method).toBe('POST');
    expect(observedRequest?.url).toBe('https://api.example.com/submit');
  });

  test('response.after hook can modify response status', async () => {
    restore = installFetchMock(async () => {
      return new Response('{}', { status: 500 });
    });

    const plugin = definePlugin({
      name: 'test-status-override',
      hooks: {
        'response.after': async (input, output) => {
          if (input.response.status === 500) {
            output.status = 503;
            output.statusText = 'Service Temporarily Unavailable';
          }
        }
      }
    });

    const pluginManager = await createPluginManager([plugin]);

    const engine = createEngine({
      transport: createFetchTransport(fetch),
      pluginManager
    });

    const response = await engine.runString('GET https://api.example.com/test\n');

    expect(response.status).toBe(503);
  });

  test('response.after hook can modify response body', async () => {
    restore = installFetchMock(async () => {
      return new Response('{"original": true}', { status: 200 });
    });

    const plugin = definePlugin({
      name: 'test-body-modifier',
      hooks: {
        'response.after': async (input, output) => {
          const body = await input.response.json();
          body.modified = true;
          output.body = JSON.stringify(body);
        }
      }
    });

    const pluginManager = await createPluginManager([plugin]);

    const engine = createEngine({
      transport: createFetchTransport(fetch),
      pluginManager
    });

    const response = await engine.runString('GET https://api.example.com/test\n');
    const body = await response.json();

    expect(body.original).toBe(true);
    expect(body.modified).toBe(true);
  });
});

// ============================================================================
// Plugin Composition Tests
// ============================================================================

describe('Plugin System - Composition', () => {
  let restore: (() => void) | null = null;

  afterEach(() => {
    restore?.();
    restore = null;
  });

  test('multiple plugins execute hooks in load order', async () => {
    const executionOrder: string[] = [];

    restore = installFetchMock(async () => {
      return new Response('{}', { status: 200 });
    });

    const plugin1 = definePlugin({
      name: 'plugin-first',
      hooks: {
        'request.before': async () => {
          executionOrder.push('first');
        }
      }
    });

    const plugin2 = definePlugin({
      name: 'plugin-second',
      hooks: {
        'request.before': async () => {
          executionOrder.push('second');
        }
      }
    });

    const plugin3 = definePlugin({
      name: 'plugin-third',
      hooks: {
        'request.before': async () => {
          executionOrder.push('third');
        }
      }
    });

    const pluginManager = await createPluginManager([plugin1, plugin2, plugin3]);

    const engine = createEngine({
      transport: createFetchTransport(fetch),
      pluginManager
    });

    await engine.runString('GET https://api.example.com/test\n');

    expect(executionOrder).toEqual(['first', 'second', 'third']);
  });

  test('plugins can compose header modifications', async () => {
    let capturedHeaders: Record<string, string> | undefined;

    restore = installFetchMock(async (_url, init) => {
      capturedHeaders = init?.headers as Record<string, string>;
      return new Response('{}', { status: 200 });
    });

    const plugin1 = definePlugin({
      name: 'plugin-auth',
      hooks: {
        'request.before': async (_input, output) => {
          output.request = {
            ...output.request,
            headers: {
              ...output.request.headers,
              Authorization: 'Bearer token123'
            }
          };
        }
      }
    });

    const plugin2 = definePlugin({
      name: 'plugin-tracing',
      hooks: {
        'request.before': async (_input, output) => {
          output.request = {
            ...output.request,
            headers: {
              ...output.request.headers,
              'X-Trace-ID': 'trace-abc'
            }
          };
        }
      }
    });

    const pluginManager = await createPluginManager([plugin1, plugin2]);

    const engine = createEngine({
      transport: createFetchTransport(fetch),
      pluginManager
    });

    await engine.runString('GET https://api.example.com/test\n');

    expect(capturedHeaders?.['Authorization']).toBe('Bearer token123');
    expect(capturedHeaders?.['X-Trace-ID']).toBe('trace-abc');
  });

  test('later plugin sees earlier plugin modifications', async () => {
    let secondPluginSawAuth = false;

    restore = installFetchMock(async () => {
      return new Response('{}', { status: 200 });
    });

    const plugin1 = definePlugin({
      name: 'plugin-auth',
      hooks: {
        'request.before': async (_input, output) => {
          output.request = {
            ...output.request,
            headers: {
              ...output.request.headers,
              Authorization: 'Bearer token123'
            }
          };
        }
      }
    });

    const plugin2 = definePlugin({
      name: 'plugin-observer',
      hooks: {
        'request.before': async (_input, output) => {
          secondPluginSawAuth = output.request.headers['Authorization'] === 'Bearer token123';
        }
      }
    });

    const pluginManager = await createPluginManager([plugin1, plugin2]);

    const engine = createEngine({
      transport: createFetchTransport(fetch),
      pluginManager
    });

    await engine.runString('GET https://api.example.com/test\n');

    expect(secondPluginSawAuth).toBe(true);
  });
});

// ============================================================================
// Plugin Retry Tests
// ============================================================================

describe('Plugin System - Retry', () => {
  let restore: (() => void) | null = null;

  afterEach(() => {
    restore?.();
    restore = null;
  });

  test('response.after can signal retry', async () => {
    let attempts = 0;

    restore = installFetchMock(async () => {
      attempts++;
      if (attempts < 3) {
        return new Response('{}', { status: 429 });
      }
      return new Response('{}', { status: 200 });
    });

    const plugin = definePlugin({
      name: 'test-retry',
      hooks: {
        'response.after': async (input, output) => {
          if (input.response.status === 429 && input.ctx.retries < 3) {
            output.retry = { delayMs: 10, reason: 'Rate limited' };
          }
        }
      }
    });

    const pluginManager = await createPluginManager([plugin]);

    const engine = createEngine({
      transport: createFetchTransport(fetch),
      pluginManager,
      maxRetries: 5
    });

    const response = await engine.runString('GET https://api.example.com/test\n');

    expect(attempts).toBe(3);
    expect(response.status).toBe(200);
  });

  test('retry increments ctx.retries', async () => {
    const retryCountsSeen: number[] = [];

    restore = installFetchMock(async () => {
      return new Response('{}', { status: 503 });
    });

    const plugin = definePlugin({
      name: 'test-retry-counter',
      hooks: {
        'request.before': async (input) => {
          retryCountsSeen.push(input.ctx.retries);
        },
        'response.after': async (input, output) => {
          if (input.ctx.retries < 2) {
            output.retry = { delayMs: 1 };
          }
        }
      }
    });

    const pluginManager = await createPluginManager([plugin]);

    const engine = createEngine({
      transport: createFetchTransport(fetch),
      pluginManager,
      maxRetries: 5
    });

    await engine.runString('GET https://api.example.com/test\n');

    expect(retryCountsSeen).toEqual([0, 1, 2]);
  });

  test('retry respects maxRetries', async () => {
    let attempts = 0;

    restore = installFetchMock(async () => {
      attempts++;
      return new Response('{}', { status: 503 });
    });

    const plugin = definePlugin({
      name: 'test-max-retry',
      hooks: {
        'response.after': async (_input, output) => {
          // Always signal retry
          output.retry = { delayMs: 1 };
        }
      }
    });

    const pluginManager = await createPluginManager([plugin]);

    const engine = createEngine({
      transport: createFetchTransport(fetch),
      pluginManager,
      maxRetries: 3
    });

    await engine.runString('GET https://api.example.com/test\n');

    // Initial attempt + 3 retries = 4 total attempts
    expect(attempts).toBe(4);
  });
});

// ============================================================================
// Plugin Resolver Tests
// ============================================================================

describe('Plugin System - Resolvers', () => {
  let restore: (() => void) | null = null;

  afterEach(() => {
    restore?.();
    restore = null;
  });

  test('plugin resolvers are available in interpolation', async () => {
    let capturedUrl: string | undefined;

    restore = installFetchMock(async (url) => {
      capturedUrl = String(url);
      return new Response('{}', { status: 200 });
    });

    const plugin = definePlugin({
      name: 'test-resolver',
      resolvers: {
        $timestamp: async () => '1234567890'
      }
    });

    const pluginManager = await createPluginManager([plugin]);
    const resolvers = pluginManager.getResolvers();

    const engine = createEngine({
      transport: createFetchTransport(fetch),
      pluginManager,
      resolvers
    });

    await engine.runString('GET https://api.example.com/test?ts={{$timestamp()}}\n');

    expect(capturedUrl).toBe('https://api.example.com/test?ts=1234567890');
  });

  test('plugin resolvers can accept arguments', async () => {
    let capturedHeader: string | undefined;

    restore = installFetchMock(async (_url, init) => {
      capturedHeader = (init?.headers as Record<string, string>)?.['X-Hash'];
      return new Response('{}', { status: 200 });
    });

    const plugin = definePlugin({
      name: 'test-hash-resolver',
      resolvers: {
        $hash: async (algorithm: string, value: string) => {
          return `${algorithm}:${value.length}`;
        }
      }
    });

    const pluginManager = await createPluginManager([plugin]);
    const resolvers = pluginManager.getResolvers();

    const engine = createEngine({
      transport: createFetchTransport(fetch),
      pluginManager,
      resolvers
    });

    // Use JSON array syntax for multiple arguments
    await engine.runString(`GET https://api.example.com/test
X-Hash: {{$hash(["sha256", "hello"])}}
`);

    expect(capturedHeader).toBe('sha256:5');
  });

  test('resolver errors propagate as exceptions', async () => {
    restore = installFetchMock(async () => {
      return new Response('{}', { status: 200 });
    });

    const plugin = definePlugin({
      name: 'test-failing-resolver',
      resolvers: {
        $failing: async () => {
          throw new Error('Resolver failed');
        }
      }
    });

    const pluginManager = await createPluginManager([plugin]);
    const resolvers = pluginManager.getResolvers();

    const engine = createEngine({
      transport: createFetchTransport(fetch),
      pluginManager,
      resolvers
    });

    // Resolver errors currently throw - this tests actual behavior
    await expect(
      engine.runString(`GET https://api.example.com/test
X-Value: {{$failing()}}
`)
    ).rejects.toThrow('Resolver failed');
  });
});

// ============================================================================
// Plugin Graceful Degradation Tests
// ============================================================================

describe('Plugin System - Graceful Degradation', () => {
  let restore: (() => void) | null = null;

  afterEach(() => {
    restore?.();
    restore = null;
  });

  test('hook errors do not crash the request', async () => {
    let fetchCompleted = false;

    restore = installFetchMock(async () => {
      fetchCompleted = true;
      return new Response('{}', { status: 200 });
    });

    const plugin = definePlugin({
      name: 'test-crashing-hook',
      hooks: {
        'request.before': async () => {
          throw new Error('Hook crashed');
        }
      }
    });

    const pluginManager = await createPluginManager([plugin]);

    const engine = createEngine({
      transport: createFetchTransport(fetch),
      pluginManager
    });

    // Should not throw
    const response = await engine.runString('GET https://api.example.com/test\n');

    expect(fetchCompleted).toBe(true);
    expect(response.status).toBe(200);
  });

  test('one plugin crashing does not stop other plugins', async () => {
    const executedPlugins: string[] = [];

    restore = installFetchMock(async () => {
      return new Response('{}', { status: 200 });
    });

    const plugin1 = definePlugin({
      name: 'plugin-before-crash',
      hooks: {
        'request.before': async () => {
          executedPlugins.push('before-crash');
        }
      }
    });

    const plugin2 = definePlugin({
      name: 'plugin-crasher',
      hooks: {
        'request.before': async () => {
          executedPlugins.push('crasher-start');
          throw new Error('Intentional crash');
        }
      }
    });

    const plugin3 = definePlugin({
      name: 'plugin-after-crash',
      hooks: {
        'request.before': async () => {
          executedPlugins.push('after-crash');
        }
      }
    });

    const pluginManager = await createPluginManager([plugin1, plugin2, plugin3]);

    const engine = createEngine({
      transport: createFetchTransport(fetch),
      pluginManager
    });

    await engine.runString('GET https://api.example.com/test\n');

    expect(executedPlugins).toContain('before-crash');
    expect(executedPlugins).toContain('crasher-start');
    expect(executedPlugins).toContain('after-crash');
  });
});

// ============================================================================
// Plugin Lifecycle Tests
// ============================================================================

describe('Plugin System - Lifecycle', () => {
  test('setup is called when plugin is initialized', async () => {
    let setupCalled = false;
    let receivedProjectRoot: string | undefined;

    const plugin = definePlugin({
      name: 'test-setup',
      setup: (ctx) => {
        setupCalled = true;
        receivedProjectRoot = ctx.projectRoot;
      }
    });

    await createPluginManager([plugin]);

    expect(setupCalled).toBe(true);
    expect(receivedProjectRoot).toBe('/test');
  });

  test('teardown is called when manager is destroyed', async () => {
    let teardownCalled = false;

    const plugin = definePlugin({
      name: 'test-teardown',
      teardown: () => {
        teardownCalled = true;
      }
    });

    const manager = await createPluginManager([plugin]);
    await manager.teardown();

    expect(teardownCalled).toBe(true);
  });

  test('setup error does not prevent other plugins from loading', async () => {
    const setupResults: string[] = [];

    const plugin1 = definePlugin({
      name: 'plugin-setup-ok',
      setup: () => {
        setupResults.push('plugin1-ok');
      }
    });

    const plugin2 = definePlugin({
      name: 'plugin-setup-fail',
      setup: () => {
        setupResults.push('plugin2-start');
        throw new Error('Setup failed');
      }
    });

    const plugin3 = definePlugin({
      name: 'plugin-setup-also-ok',
      setup: () => {
        setupResults.push('plugin3-ok');
      }
    });

    await createPluginManager([plugin1, plugin2, plugin3]);

    expect(setupResults).toContain('plugin1-ok');
    expect(setupResults).toContain('plugin2-start');
    expect(setupResults).toContain('plugin3-ok');
  });
});

// ============================================================================
// definePlugin Helper Tests
// ============================================================================

describe('definePlugin Helper', () => {
  test('returns plugin with required fields', () => {
    const plugin = definePlugin({
      name: 'my-plugin'
    });

    expect(plugin.name).toBe('my-plugin');
  });

  test('preserves all provided fields', () => {
    const hooks = {
      'request.before': async () => {}
    };

    const resolvers = {
      $test: async () => 'value'
    };

    const plugin = definePlugin({
      name: 'full-plugin',
      version: '1.0.0',
      instanceId: 'custom',
      permissions: ['network', 'secrets'],
      hooks,
      resolvers
    });

    expect(plugin.name).toBe('full-plugin');
    expect(plugin.version).toBe('1.0.0');
    expect(plugin.instanceId).toBe('custom');
    expect(plugin.permissions).toEqual(['network', 'secrets']);
    expect(plugin.hooks).toBe(hooks);
    expect(plugin.resolvers).toBe(resolvers);
  });

  test('validates plugin has a name', () => {
    expect(() => {
      // @ts-expect-error Testing runtime validation
      definePlugin({});
    }).toThrow();
  });
});

// ============================================================================
// Plugin Events Tests
// ============================================================================

describe('Plugin System - Events', () => {
  let restore: (() => void) | null = null;

  afterEach(() => {
    restore?.();
    restore = null;
  });

  test('plugin event handler receives engine events', async () => {
    const receivedEvents: string[] = [];

    restore = installFetchMock(async () => {
      return new Response('{}', { status: 200 });
    });

    const plugin = definePlugin({
      name: 'test-event-listener',
      event: async ({ event }) => {
        receivedEvents.push(event.type);
      }
    });

    const pluginManager = await createPluginManager([plugin]);

    const engine = createEngine({
      transport: createFetchTransport(fetch),
      pluginManager,
      onEvent: (event) => {
        pluginManager.emitEngineEvent(event);
      }
    });

    await engine.runString('GET https://api.example.com/test\n');

    expect(receivedEvents).toContain('fetchStarted');
    expect(receivedEvents).toContain('fetchFinished');
  });
});

// ============================================================================
// Hook Context Tests
// ============================================================================

describe('Plugin System - Hook Context', () => {
  let restore: (() => void) | null = null;

  afterEach(() => {
    restore?.();
    restore = null;
  });

  test('hook context contains session variables', async () => {
    let receivedVariables: Record<string, unknown> | undefined;

    restore = installFetchMock(async () => {
      return new Response('{}', { status: 200 });
    });

    const plugin = definePlugin({
      name: 'test-context',
      hooks: {
        'request.before': async (input) => {
          receivedVariables = input.variables;
        }
      }
    });

    const pluginManager = await createPluginManager([plugin]);

    const engine = createEngine({
      transport: createFetchTransport(fetch),
      pluginManager
    });

    await engine.runString('GET https://api.example.com/test\n', {
      variables: { apiKey: 'secret123', env: 'production' }
    });

    expect(receivedVariables?.['apiKey']).toBe('secret123');
    expect(receivedVariables?.['env']).toBe('production');
  });

  test('hook context contains config information', async () => {
    let receivedProjectRoot: string | undefined;

    restore = installFetchMock(async () => {
      return new Response('{}', { status: 200 });
    });

    const plugin = definePlugin({
      name: 'test-config-context',
      hooks: {
        'request.before': async (input) => {
          receivedProjectRoot = input.ctx.projectRoot;
        }
      }
    });

    const pluginManager = await createPluginManager([plugin]);

    const engine = createEngine({
      transport: createFetchTransport(fetch),
      pluginManager
    });

    await engine.runString('GET https://api.example.com/test\n');

    expect(receivedProjectRoot).toBe('/test');
  });
});

// ============================================================================
// End-to-End Integration Tests
// ============================================================================

describe('Plugin System - Integration', () => {
  test('plugin adds header that server receives and echoes back', async () => {
    // Create a simple echo server using Bun.serve
    const server = Bun.serve({
      port: 0, // Let OS assign a free port
      fetch(request) {
        // Echo back all headers as JSON
        const headers: Record<string, string> = {};
        request.headers.forEach((value, key) => {
          headers[key] = value;
        });
        return new Response(JSON.stringify({ headers }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
    });

    try {
      const uniqueValue = `test-value-${Date.now()}`;

      const plugin = definePlugin({
        name: 'test-header-plugin',
        hooks: {
          'request.before': async (_input, output) => {
            output.request = {
              ...output.request,
              headers: {
                ...output.request.headers,
                'X-Plugin-Header': uniqueValue
              }
            };
          }
        }
      });

      const pluginManager = await createPluginManager([plugin]);

      const engine = createEngine({
        transport: createFetchTransport(fetch),
        pluginManager
      });

      // Make real request to the test server
      const response = await engine.runString(`GET http://localhost:${server.port}/echo\n`);

      expect(response.status).toBe(200);

      const body = await response.json();

      // Verify the server received our plugin-added header
      expect(body.headers['x-plugin-header']).toBe(uniqueValue);
    } finally {
      server.stop();
    }
  });

  test('multiple plugins compose headers end-to-end', async () => {
    const server = Bun.serve({
      port: 0,
      fetch(request) {
        const headers: Record<string, string> = {};
        request.headers.forEach((value, key) => {
          headers[key] = value;
        });
        return new Response(JSON.stringify({ headers }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
    });

    try {
      const plugin1 = definePlugin({
        name: 'auth-plugin',
        hooks: {
          'request.before': async (_input, output) => {
            output.request = {
              ...output.request,
              headers: {
                ...output.request.headers,
                Authorization: 'Bearer test-token'
              }
            };
          }
        }
      });

      const plugin2 = definePlugin({
        name: 'tracing-plugin',
        hooks: {
          'request.before': async (_input, output) => {
            output.request = {
              ...output.request,
              headers: {
                ...output.request.headers,
                'X-Trace-ID': 'trace-123'
              }
            };
          }
        }
      });

      const pluginManager = await createPluginManager([plugin1, plugin2]);

      const engine = createEngine({
        transport: createFetchTransport(fetch),
        pluginManager
      });

      const response = await engine.runString(`GET http://localhost:${server.port}/test\n`);

      const body = await response.json();

      // Verify both plugin headers arrived
      expect(body.headers['authorization']).toBe('Bearer test-token');
      expect(body.headers['x-trace-id']).toBe('trace-123');
    } finally {
      server.stop();
    }
  });

  test('plugin resolver provides dynamic value used in request', async () => {
    const dynamicToken = `dynamic-${Date.now()}`;

    const server = Bun.serve({
      port: 0,
      fetch(request) {
        const authHeader = request.headers.get('authorization');
        return new Response(JSON.stringify({ received: authHeader }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
    });

    try {
      const plugin = definePlugin({
        name: 'token-plugin',
        resolvers: {
          $dynamicToken: async () => dynamicToken
        }
      });

      const pluginManager = await createPluginManager([plugin]);
      const resolvers = pluginManager.getResolvers();

      const engine = createEngine({
        transport: createFetchTransport(fetch),
        pluginManager,
        resolvers
      });

      const response = await engine.runString(
        `GET http://localhost:${server.port}/api
Authorization: Bearer {{$dynamicToken()}}
`
      );

      const body = await response.json();

      expect(body.received).toBe(`Bearer ${dynamicToken}`);
    } finally {
      server.stop();
    }
  });

  test('request.compiled hook can sign request after interpolation', async () => {
    const server = Bun.serve({
      port: 0,
      fetch(request) {
        const headers: Record<string, string> = {};
        request.headers.forEach((value, key) => {
          headers[key] = value;
        });
        return new Response(
          JSON.stringify({
            headers,
            url: request.url
          }),
          {
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }
    });

    try {
      const plugin = definePlugin({
        name: 'signing-plugin',
        hooks: {
          // Sign the fully interpolated request
          'request.compiled': async (input, output) => {
            // Simple signature based on URL length (demo purpose)
            const signature = `sig-${input.request.url.length}`;
            output.request = {
              ...output.request,
              headers: {
                ...output.request.headers,
                'X-Signature': signature
              }
            };
          }
        }
      });

      const pluginManager = await createPluginManager([plugin]);

      const engine = createEngine({
        transport: createFetchTransport(fetch),
        pluginManager
      });

      const response = await engine.runString(
        `GET http://localhost:${server.port}/api/resource?id={{id}}
`,
        { variables: { id: '12345' } }
      );

      const body = await response.json();

      // The signature should be based on the fully interpolated URL
      expect(body.headers['x-signature']).toMatch(/^sig-\d+$/);
      // Verify the URL was correctly interpolated
      expect(body.url).toContain('id=12345');
    } finally {
      server.stop();
    }
  });

  test('retry plugin retries on server error', async () => {
    let requestCount = 0;

    const server = Bun.serve({
      port: 0,
      fetch() {
        requestCount++;
        if (requestCount < 3) {
          return new Response('Server Error', { status: 503 });
        }
        return new Response(JSON.stringify({ attempt: requestCount }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    });

    try {
      const plugin = definePlugin({
        name: 'retry-plugin',
        hooks: {
          'response.after': async (input, output) => {
            if (input.response.status >= 500 && input.ctx.retries < 5) {
              output.retry = { delayMs: 10, reason: 'Server error' };
            }
          }
        }
      });

      const pluginManager = await createPluginManager([plugin]);

      const engine = createEngine({
        transport: createFetchTransport(fetch),
        pluginManager,
        maxRetries: 5
      });

      const response = await engine.runString(`GET http://localhost:${server.port}/flaky\n`);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.attempt).toBe(3);
      expect(requestCount).toBe(3);
    } finally {
      server.stop();
    }
  });
});
