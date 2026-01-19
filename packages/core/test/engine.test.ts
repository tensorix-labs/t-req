import { describe, expect, test } from 'bun:test';
import { createEngine } from '../src/engine/engine';
import { createFetchTransport } from '../src/runtime/fetch-transport';

function createMemoryIO(files: Record<string, string | ArrayBuffer>) {
  const pathApi = {
    sep: '/',
    resolve: (...parts: string[]) => {
      const joined = parts.join('/').replace(/\/+/g, '/');
      if (joined.startsWith('/')) return joined;
      return `/${joined}`;
    },
    dirname: (p: string) => {
      const idx = p.lastIndexOf('/');
      return idx <= 0 ? '/' : p.slice(0, idx);
    },
    basename: (p: string) => p.split('/').pop() ?? '',
    extname: (p: string) => {
      const base = p.split('/').pop() ?? '';
      const dot = base.lastIndexOf('.');
      return dot <= 0 ? '' : base.slice(dot);
    },
    isAbsolute: (p: string) => p.startsWith('/')
  } as const;

  return {
    cwd: () => '/',
    path: pathApi,
    exists: async (p: string) => Object.hasOwn(files, p),
    readText: async (p: string) => {
      const v = files[p];
      if (typeof v === 'string') return v;
      throw new Error(`Not a text file: ${p}`);
    },
    readBinary: async (p: string) => {
      const v = files[p];
      if (v instanceof ArrayBuffer) return v;
      throw new Error(`Not a binary file: ${p}`);
    }
  };
}

describe('engine', () => {
  test('runString executes a simple request', async () => {
    const restore = installFetchMock(async (url) => {
      expect(String(url)).toBe('https://example.com/api');
      return new Response('{}', { status: 200 });
    });

    try {
      const engine = createEngine({
        transport: createFetchTransport(fetch)
      });
      const res = await engine.runString('GET https://example.com/api\n');
      expect(res.status).toBe(200);
    } finally {
      restore();
    }
  });

  test('runString interpolates variables', async () => {
    const restore = installFetchMock(async (url) => {
      expect(String(url)).toBe('https://api.example.com/users');
      return new Response('{}', { status: 200 });
    });

    try {
      const engine = createEngine({
        transport: createFetchTransport(fetch),
        resolvers: {}
      });

      await engine.runString('GET https://{{host}}/{{path}}\n', {
        variables: { host: 'api.example.com', path: 'users' }
      });
    } finally {
      restore();
    }
  });

  test('runFile resolves < ./file body relative to .http file', async () => {
    const payload = '{"ok":true}';
    const io = createMemoryIO({
      '/app/req.http': 'POST https://example.com/api\n\n< ./payload.json\n',
      '/app/payload.json': payload
    });

    const restore = installFetchMock(async (_url, init) => {
      expect(init?.method).toBe('POST');
      expect(init?.body).toBe(payload);
      const headers = init?.headers as Record<string, string>;
      expect(headers['Content-Type']).toBe('application/json');
      return new Response('{}', { status: 200 });
    });

    try {
      const engine = createEngine({
        io,
        transport: createFetchTransport(fetch)
      });
      await engine.runFile('/app/req.http');
    } finally {
      restore();
    }
  });
});

function installFetchMock(
  impl: (url: string | URL | Request, init?: RequestInit) => Promise<Response>
): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = Object.assign(impl, { preconnect: () => {} }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}
