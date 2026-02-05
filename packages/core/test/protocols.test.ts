import { describe, expect, test } from 'bun:test';
import { httpHandler } from '../src/protocols/http';
import {
  getDefaultHandler,
  getHandler,
  getRegisteredProtocols,
  hasHandler,
  registerProtocol
} from '../src/protocols/registry';
import { createSSEResponse, parseSSEStream, sseHandler } from '../src/protocols/sse';
import type { ParsedRequest } from '../src/types';

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

/**
 * Helper to collect all messages from an async generator.
 */
async function collectMessages<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const results: T[] = [];
  for await (const item of gen) {
    results.push(item);
  }
  return results;
}

describe('parseSSEStream', () => {
  test('parses simple data message', async () => {
    const stream = createStreamFromChunks(['data: hello world\n\n']);
    const reader = stream.getReader();

    const messages = await collectMessages(parseSSEStream(reader));

    expect(messages).toHaveLength(1);
    expect(messages[0]?.data).toBe(' hello world');
  });

  test('parses message with event type', async () => {
    const stream = createStreamFromChunks(['event: message\ndata: test\n\n']);
    const reader = stream.getReader();

    const messages = await collectMessages(parseSSEStream(reader));

    expect(messages).toHaveLength(1);
    expect(messages[0]?.event).toBe('message');
    expect(messages[0]?.data).toBe(' test');
  });

  test('parses message with id', async () => {
    const stream = createStreamFromChunks(['id: 123\ndata: test\n\n']);
    const reader = stream.getReader();

    const messages = await collectMessages(parseSSEStream(reader));

    expect(messages).toHaveLength(1);
    expect(messages[0]?.id).toBe('123');
    expect(messages[0]?.data).toBe(' test');
  });

  test('parses message with retry', async () => {
    const stream = createStreamFromChunks(['retry: 5000\ndata: test\n\n']);
    const reader = stream.getReader();

    const messages = await collectMessages(parseSSEStream(reader));

    expect(messages).toHaveLength(1);
    expect(messages[0]?.retry).toBe(5000);
    expect(messages[0]?.data).toBe(' test');
  });

  test('parses multi-line data', async () => {
    const stream = createStreamFromChunks(['data: line 1\ndata: line 2\ndata: line 3\n\n']);
    const reader = stream.getReader();

    const messages = await collectMessages(parseSSEStream(reader));

    expect(messages).toHaveLength(1);
    expect(messages[0]?.data).toBe(' line 1\n line 2\n line 3');
  });

  test('parses multiple messages', async () => {
    const stream = createStreamFromChunks(['data: first\n\ndata: second\n\ndata: third\n\n']);
    const reader = stream.getReader();

    const messages = await collectMessages(parseSSEStream(reader));

    expect(messages).toHaveLength(3);
    expect(messages[0]?.data).toBe(' first');
    expect(messages[1]?.data).toBe(' second');
    expect(messages[2]?.data).toBe(' third');
  });

  test('ignores comment lines (keep-alive)', async () => {
    const stream = createStreamFromChunks([': this is a comment\ndata: test\n\n']);
    const reader = stream.getReader();

    const messages = await collectMessages(parseSSEStream(reader));

    expect(messages).toHaveLength(1);
    expect(messages[0]?.data).toBe(' test');
  });

  test('handles stream split across chunks', async () => {
    const stream = createStreamFromChunks(['data: hel', 'lo world\n', '\n']);
    const reader = stream.getReader();

    const messages = await collectMessages(parseSSEStream(reader));

    expect(messages).toHaveLength(1);
    expect(messages[0]?.data).toBe(' hello world');
  });

  test('handles complete message with all fields', async () => {
    const stream = createStreamFromChunks([
      'id: msg-001\nevent: update\nretry: 3000\ndata: {"status":"ok"}\n\n'
    ]);
    const reader = stream.getReader();

    const messages = await collectMessages(parseSSEStream(reader));

    expect(messages).toHaveLength(1);
    expect(messages[0]?.id).toBe('msg-001');
    expect(messages[0]?.event).toBe('update');
    expect(messages[0]?.retry).toBe(3000);
    expect(messages[0]?.data).toBe(' {"status":"ok"}');
  });

  test('skips messages without data field', async () => {
    const stream = createStreamFromChunks(['id: 123\nevent: ping\n\ndata: real message\n\n']);
    const reader = stream.getReader();

    const messages = await collectMessages(parseSSEStream(reader));

    expect(messages).toHaveLength(1);
    expect(messages[0]?.data).toBe(' real message');
  });

  test('handles carriage return line endings', async () => {
    const stream = createStreamFromChunks(['data: test\r\n\r\n']);
    const reader = stream.getReader();

    const messages = await collectMessages(parseSSEStream(reader));

    expect(messages).toHaveLength(1);
  });

  test('flushes remaining message at end of stream with newline', async () => {
    // Stream ends with data but no double-newline terminator
    const stream = createStreamFromChunks(['data: incomplete\n']);
    const reader = stream.getReader();

    const messages = await collectMessages(parseSSEStream(reader));

    expect(messages).toHaveLength(1);
    expect(messages[0]?.data).toBe(' incomplete');
  });

  test('incomplete message without newline is not yielded', async () => {
    // SSE spec: messages require proper line termination
    // Content without trailing newline stays in buffer and is lost
    const stream = createStreamFromChunks(['data: incomplete']);
    const reader = stream.getReader();

    const messages = await collectMessages(parseSSEStream(reader));

    // Parser requires at least one newline to process the data line
    expect(messages).toHaveLength(0);
  });

  test('handles empty stream', async () => {
    const stream = createStreamFromChunks([]);
    const reader = stream.getReader();

    const messages = await collectMessages(parseSSEStream(reader));

    expect(messages).toHaveLength(0);
  });

  test('ignores invalid retry value', async () => {
    const stream = createStreamFromChunks(['retry: not-a-number\ndata: test\n\n']);
    const reader = stream.getReader();

    const messages = await collectMessages(parseSSEStream(reader));

    expect(messages).toHaveLength(1);
    expect(messages[0]?.retry).toBeUndefined();
  });
});

describe('createSSEResponse', () => {
  test('creates SSEResponse from Response', async () => {
    const body = createStreamFromChunks(['data: test\n\n']);
    const response = new Response(body, {
      headers: { 'Content-Type': 'text/event-stream' }
    });

    const sseResponse = createSSEResponse(response);

    expect(sseResponse.type).toBe('sse');
    expect(sseResponse.response).toBe(response);
    expect(typeof sseResponse.close).toBe('function');
  });

  test('throws if Response has no body', () => {
    const response = new Response(null);

    expect(() => createSSEResponse(response)).toThrow('SSE response has no body');
  });

  test('is async iterable', async () => {
    const body = createStreamFromChunks(['data: one\n\n', 'data: two\n\n']);
    const response = new Response(body, {
      headers: { 'Content-Type': 'text/event-stream' }
    });

    const sseResponse = createSSEResponse(response);
    const messages = [];

    for await (const msg of sseResponse) {
      messages.push(msg);
    }

    expect(messages).toHaveLength(2);
  });

  test('tracks lastEventId', async () => {
    const body = createStreamFromChunks([
      'id: first-id\ndata: one\n\n',
      'id: second-id\ndata: two\n\n'
    ]);
    const response = new Response(body, {
      headers: { 'Content-Type': 'text/event-stream' }
    });

    const sseResponse = createSSEResponse(response);

    for await (const _ of sseResponse) {
      // Consume all messages
    }

    expect(sseResponse.lastEventId).toBe('second-id');
  });

  test('close() stops iteration', async () => {
    const body = createStreamFromChunks(['data: one\n\n', 'data: two\n\n', 'data: three\n\n']);
    const response = new Response(body, {
      headers: { 'Content-Type': 'text/event-stream' }
    });

    const sseResponse = createSSEResponse(response);
    const messages = [];

    for await (const msg of sseResponse) {
      messages.push(msg);
      if (messages.length === 1) {
        sseResponse.close();
      }
    }

    expect(messages).toHaveLength(1);
  });
});

describe('sseHandler.canHandle', () => {
  test('returns true for request with protocol: sse', () => {
    const request: ParsedRequest = {
      method: 'GET',
      url: 'https://example.com/stream',
      headers: {},
      raw: '',
      meta: {},
      protocol: 'sse'
    };

    expect(sseHandler.canHandle(request)).toBe(true);
  });

  test('returns true for request with Accept: text/event-stream', () => {
    const request: ParsedRequest = {
      method: 'GET',
      url: 'https://example.com/stream',
      headers: { Accept: 'text/event-stream' },
      raw: '',
      meta: {}
    };

    expect(sseHandler.canHandle(request)).toBe(true);
  });

  test('returns true for request with lowercase accept header', () => {
    const request: ParsedRequest = {
      method: 'GET',
      url: 'https://example.com/stream',
      headers: { accept: 'text/event-stream' },
      raw: '',
      meta: {}
    };

    expect(sseHandler.canHandle(request)).toBe(true);
  });

  test('returns false for regular HTTP request', () => {
    const request: ParsedRequest = {
      method: 'GET',
      url: 'https://example.com/api',
      headers: { Accept: 'application/json' },
      raw: '',
      meta: {}
    };

    expect(sseHandler.canHandle(request)).toBe(false);
  });
});

describe('httpHandler.canHandle', () => {
  test('returns true for request without protocol', () => {
    const request: ParsedRequest = {
      method: 'GET',
      url: 'https://example.com/api',
      headers: {},
      raw: '',
      meta: {}
    };

    expect(httpHandler.canHandle(request)).toBe(true);
  });

  test('returns true for request with protocol: http', () => {
    const request: ParsedRequest = {
      method: 'GET',
      url: 'https://example.com/api',
      headers: {},
      raw: '',
      meta: {},
      protocol: 'http'
    };

    expect(httpHandler.canHandle(request)).toBe(true);
  });

  test('returns false for request with protocol: sse', () => {
    const request: ParsedRequest = {
      method: 'GET',
      url: 'https://example.com/stream',
      headers: {},
      raw: '',
      meta: {},
      protocol: 'sse'
    };

    expect(httpHandler.canHandle(request)).toBe(false);
  });
});

describe('protocol registry', () => {
  test('hasHandler returns true for registered protocols', () => {
    // HTTP and SSE are registered on import
    expect(hasHandler('http')).toBe(true);
    expect(hasHandler('sse')).toBe(true);
  });

  test('getHandler returns correct handler for http', () => {
    const handler = getHandler('http');
    expect(handler).toBeDefined();
    expect(handler?.protocol).toBe('http');
  });

  test('getHandler returns correct handler for sse', () => {
    const handler = getHandler('sse');
    expect(handler).toBeDefined();
    expect(handler?.protocol).toBe('sse');
  });

  test('getDefaultHandler returns http handler', () => {
    const handler = getDefaultHandler();
    expect(handler.protocol).toBe('http');
  });

  test('getRegisteredProtocols includes http and sse', () => {
    const protocols = getRegisteredProtocols();
    expect(protocols).toContain('http');
    expect(protocols).toContain('sse');
  });
});
