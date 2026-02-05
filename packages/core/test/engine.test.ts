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

/**
 * Helper to create a readable stream from string chunks.
 */
function createStreamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;

  return new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index]));
        index++;
      } else {
        controller.close();
      }
    }
  });
}

describe('engine streaming', () => {
  test('streamString executes SSE request and returns SSEResponse', async () => {
    const sseChunks = ['event: message\ndata: hello\n\n', 'data: world\n\n'];
    const restore = installFetchMock(async (url, init) => {
      expect(String(url)).toBe('https://example.com/stream');
      expect(init?.headers).toMatchObject({
        Accept: 'text/event-stream',
        'Cache-Control': 'no-cache'
      });

      return new Response(createStreamFromChunks(sseChunks), {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' }
      });
    });

    try {
      const engine = createEngine({
        transport: createFetchTransport(fetch)
      });

      const stream = await engine.streamString(`
# @sse
GET https://example.com/stream
`);

      expect(stream.type).toBe('sse');

      const messages = [];
      for await (const msg of stream) {
        messages.push(msg);
      }

      expect(messages).toHaveLength(2);
      expect(messages[0]?.event).toBe('message');
      expect(messages[0]?.data).toBe(' hello');
      expect(messages[1]?.data).toBe(' world');
    } finally {
      restore();
    }
  });

  test('streamString throws for non-streaming protocol', async () => {
    const restore = installFetchMock(async () => {
      return new Response('{}', { status: 200 });
    });

    try {
      const engine = createEngine({
        transport: createFetchTransport(fetch)
      });

      await expect(engine.streamString('GET https://example.com/api\n')).rejects.toThrow(
        /streaming protocol/
      );
    } finally {
      restore();
    }
  });

  test('streamString interpolates variables in SSE request', async () => {
    const restore = installFetchMock(async (url) => {
      expect(String(url)).toBe('https://api.example.com/events');

      return new Response(createStreamFromChunks(['data: test\n\n']), {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' }
      });
    });

    try {
      const engine = createEngine({
        transport: createFetchTransport(fetch)
      });

      const stream = await engine.streamString(
        `
# @sse
GET https://{{host}}/{{path}}
`,
        { variables: { host: 'api.example.com', path: 'events' } }
      );

      // Consume to verify the request was made
      for await (const _ of stream) {
        break;
      }
      stream.close();
    } finally {
      restore();
    }
  });

  test('streamString includes authorization headers', async () => {
    const restore = installFetchMock(async (_url, init) => {
      const headers = init?.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer test-token');

      return new Response(createStreamFromChunks(['data: ok\n\n']), {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' }
      });
    });

    try {
      const engine = createEngine({
        transport: createFetchTransport(fetch)
      });

      const stream = await engine.streamString(`
# @sse
GET https://example.com/stream
Authorization: Bearer test-token
`);

      for await (const _ of stream) {
        break;
      }
      stream.close();
    } finally {
      restore();
    }
  });

  test('streamString supports lastEventId option', async () => {
    const restore = installFetchMock(async (_url, init) => {
      const headers = init?.headers as Record<string, string>;
      expect(headers['Last-Event-ID']).toBe('event-123');

      return new Response(createStreamFromChunks(['data: resumed\n\n']), {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' }
      });
    });

    try {
      const engine = createEngine({
        transport: createFetchTransport(fetch)
      });

      const stream = await engine.streamString(
        `
# @sse
GET https://example.com/stream
`,
        { lastEventId: 'event-123' }
      );

      for await (const _ of stream) {
        break;
      }
      stream.close();
    } finally {
      restore();
    }
  });

  test('streamString auto-detects SSE from Accept header', async () => {
    const restore = installFetchMock(async () => {
      return new Response(createStreamFromChunks(['data: test\n\n']), {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' }
      });
    });

    try {
      const engine = createEngine({
        transport: createFetchTransport(fetch)
      });

      const stream = await engine.streamString(`
GET https://example.com/stream
Accept: text/event-stream
`);

      expect(stream.type).toBe('sse');
      stream.close();
    } finally {
      restore();
    }
  });

  test('streamString throws on HTTP error response', async () => {
    const restore = installFetchMock(async () => {
      return new Response('Not Found', { status: 404, statusText: 'Not Found' });
    });

    try {
      const engine = createEngine({
        transport: createFetchTransport(fetch)
      });

      await expect(
        engine.streamString(`
# @sse
GET https://example.com/stream
`)
      ).rejects.toThrow(/SSE request failed: 404/);
    } finally {
      restore();
    }
  });

  test('streamFile loads .http file and streams SSE', async () => {
    const io = createMemoryIO({
      '/app/sse.http': `
# @sse
GET https://example.com/stream
`
    });

    const restore = installFetchMock(async () => {
      return new Response(createStreamFromChunks(['data: from file\n\n']), {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' }
      });
    });

    try {
      const engine = createEngine({
        io,
        transport: createFetchTransport(fetch)
      });

      const stream = await engine.streamFile('/app/sse.http');

      expect(stream.type).toBe('sse');

      const messages = [];
      for await (const msg of stream) {
        messages.push(msg);
      }

      expect(messages).toHaveLength(1);
      expect(messages[0]?.data).toBe(' from file');
    } finally {
      restore();
    }
  });

  test('close() properly terminates the stream', async () => {
    let _fetchAborted = false;
    const _controller = new AbortController();

    const restore = installFetchMock(async (_url, init) => {
      if (init?.signal) {
        init.signal.addEventListener('abort', () => {
          _fetchAborted = true;
        });
      }

      // Create a stream that would produce many messages
      const stream = new ReadableStream({
        async pull(ctrl) {
          await new Promise((resolve) => setTimeout(resolve, 10));
          ctrl.enqueue(new TextEncoder().encode('data: message\n\n'));
        }
      });

      return new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' }
      });
    });

    try {
      const engine = createEngine({
        transport: createFetchTransport(fetch)
      });

      const stream = await engine.streamString(`
# @sse
GET https://example.com/stream
`);

      // Get one message then close
      for await (const _ of stream) {
        stream.close();
        break;
      }

      // Give time for cleanup
      await new Promise((resolve) => setTimeout(resolve, 50));
    } finally {
      restore();
    }
  });
});
