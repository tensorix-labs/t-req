import { describe, expect, test } from 'bun:test';
import { Writable } from 'node:stream';
import type {
  ExecuteAndConnectRequestWsResult,
  RequestWsSessionConnection,
  WsSessionServerEnvelope
} from '@t-req/sdk/client';
import {
  applySlashCommand,
  parseSlashCommand,
  parseWsVariables,
  renderHumanEvent,
  renderNdjsonEvent,
  resolveBatchWaitSeconds,
  resolveExitCode,
  runBatchSession,
  runWs,
  validateWsArgs
} from '../../src/cmd/ws';

function createMemoryWriteStream(): { stream: NodeJS.WriteStream; chunks: string[] } {
  const chunks: string[] = [];
  const writable = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(String(chunk));
      callback();
    }
  });
  return { stream: writable as unknown as NodeJS.WriteStream, chunks };
}

async function* lineSource(lines: string[]): AsyncGenerator<string> {
  for (const line of lines) {
    yield line;
  }
}

class FakeConnection implements RequestWsSessionConnection {
  readonly url = 'ws://localhost/ws/session/ws_test';
  readonly wsSessionId = 'ws_test';

  sentText: string[] = [];
  sentJson: unknown[] = [];
  pingCalls = 0;
  closeCalls: Array<{ code?: number; reason?: string }> = [];
  disconnectCalls: Array<{ code?: number; reason?: string }> = [];

  private seq = 0;
  private done = false;
  private queue: WsSessionServerEnvelope[] = [];
  private waiters: Array<(value: IteratorResult<WsSessionServerEnvelope>) => void> = [];

  sendText(payload: string): void {
    this.sentText.push(payload);
    this.enqueue({
      type: 'session.outbound',
      ts: Date.now(),
      seq: this.nextSeq(),
      wsSessionId: this.wsSessionId,
      payloadType: 'text',
      payload
    });
  }

  sendJson(payload: unknown): void {
    this.sentJson.push(payload);
    this.enqueue({
      type: 'session.outbound',
      ts: Date.now(),
      seq: this.nextSeq(),
      wsSessionId: this.wsSessionId,
      payloadType: 'json',
      payload
    });
  }

  ping(): void {
    this.pingCalls++;
  }

  close(code = 1000, reason = ''): void {
    this.closeCalls.push({ code, reason });
    this.enqueue({
      type: 'session.closed',
      ts: Date.now(),
      seq: this.nextSeq(),
      wsSessionId: this.wsSessionId,
      payload: { code, reason, wasClean: true }
    });
    this.finish();
  }

  disconnect(code = 1000, reason = ''): void {
    this.disconnectCalls.push({ code, reason });
    this.finish();
  }

  reconnect(_afterSeq?: number): Promise<RequestWsSessionConnection> {
    return Promise.resolve(this);
  }

  private nextSeq(): number {
    this.seq += 1;
    return this.seq;
  }

  private enqueue(envelope: WsSessionServerEnvelope): void {
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter({ done: false, value: envelope });
      return;
    }
    this.queue.push(envelope);
  }

  private finish(): void {
    this.done = true;
    while (this.waiters.length > 0) {
      const waiter = this.waiters.shift();
      if (!waiter) continue;
      waiter({ done: true, value: undefined as never });
    }
  }

  private nextEnvelope(): Promise<IteratorResult<WsSessionServerEnvelope>> {
    const queued = this.queue.shift();
    if (queued) {
      return Promise.resolve({ done: false, value: queued });
    }
    if (this.done) {
      return Promise.resolve({ done: true, value: undefined as never });
    }
    return new Promise<IteratorResult<WsSessionServerEnvelope>>((resolve) => {
      this.waiters.push(resolve);
    });
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<WsSessionServerEnvelope, void, void> {
    while (true) {
      const next = await this.nextEnvelope();
      if (next.done) return;
      yield next.value;
    }
  }
}

class FakeSignalTarget {
  private handlers = new Set<() => void>();
  private pendingSigint = false;

  on(event: string | symbol, listener: (...args: never[]) => void): this {
    if (event === 'SIGINT') {
      this.handlers.add(listener as () => void);
      if (this.pendingSigint) {
        this.pendingSigint = false;
        queueMicrotask(() => {
          (listener as () => void)();
        });
      }
    }
    return this;
  }

  removeListener(event: string | symbol, listener: (...args: never[]) => void): this {
    if (event === 'SIGINT') {
      this.handlers.delete(listener as () => void);
    }
    return this;
  }

  emitSigint(): void {
    if (this.handlers.size === 0) {
      this.pendingSigint = true;
      return;
    }
    for (const handler of this.handlers) {
      handler();
    }
  }
}

describe('ws command argument validation', () => {
  test('accepts ws:// and wss:// URLs in URL mode', () => {
    const wsValidated = validateWsArgs({
      url: 'ws://localhost:8080/socket',
      wait: 0,
      timeout: 100
    });
    const wssValidated = validateWsArgs({
      url: 'wss://api.example.com/realtime',
      wait: 1,
      timeout: 1000
    });

    expect(wsValidated.source).toBe('url');
    expect(wssValidated.source).toBe('url');
    expect(wsValidated.executeRequest.content).toContain('GET ws://localhost:8080/socket');
    expect(wssValidated.executeRequest.content).toContain('GET wss://api.example.com/realtime');
  });

  test('accepts file mode and selection fields', () => {
    const validated = validateWsArgs({
      file: 'collection/chat.http',
      name: 'connect',
      profile: 'dev',
      var: ['token=abc'],
      timeout: 3000,
      wait: 2
    });

    expect(validated.source).toBe('file');
    expect(validated.target).toBe('collection/chat.http');
    expect(validated.executeRequest).toEqual({
      path: 'collection/chat.http',
      requestName: 'connect',
      profile: 'dev',
      variables: { token: 'abc' },
      connectTimeoutMs: 3000
    });
  });

  test('rejects non-websocket URLs in URL mode', () => {
    expect(() =>
      validateWsArgs({
        url: 'http://example.com',
        wait: 1,
        timeout: 100
      })
    ).toThrow('URL must use ws:// or wss://');
  });

  test('rejects invalid source combinations and selector conflicts', () => {
    expect(() =>
      validateWsArgs({
        url: 'ws://localhost:8080/socket',
        file: 'collection/chat.http',
        wait: 1
      })
    ).toThrow('Specify either URL positional argument or --file, not both');

    expect(() =>
      validateWsArgs({
        wait: 1
      })
    ).toThrow('Provide either a WebSocket URL or --file');

    expect(() =>
      validateWsArgs({
        url: 'ws://localhost:8080/socket',
        name: 'connect',
        wait: 1
      })
    ).toThrow('--name and --index require --file mode');

    expect(() =>
      validateWsArgs({
        file: 'collection/chat.http',
        name: 'connect',
        index: 0,
        wait: 1
      })
    ).toThrow('Cannot specify both --name and --index');
  });
});

describe('ws variable parsing', () => {
  test('parses key=value pairs and skips invalid entries', () => {
    const vars = parseWsVariables([
      'token=abc',
      'region=us',
      'invalid',
      '=missingKey',
      '   =blankKey',
      'empty='
    ]);
    expect(vars).toEqual({
      token: 'abc',
      region: 'us',
      empty: ''
    });
  });
});

describe('ws command wait parsing', () => {
  test('uses defaults and allows -1', () => {
    expect(resolveBatchWaitSeconds(undefined)).toBe(2);
    expect(resolveBatchWaitSeconds(0)).toBe(0);
    expect(resolveBatchWaitSeconds(-1)).toBe(-1);
  });

  test('rejects invalid wait values', () => {
    expect(() => resolveBatchWaitSeconds(-2)).toThrow(
      '--wait must be -1 or a non-negative integer'
    );
    expect(() => resolveBatchWaitSeconds(1.5)).toThrow('--wait must be an integer');
  });
});

describe('ws slash command parser', () => {
  test('parses /json with valid JSON', () => {
    const parsed = parseSlashCommand('/json {"type":"ping","ok":true}');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.command.kind).toBe('json');
    if (parsed.command.kind !== 'json') return;
    expect(parsed.command.payload).toEqual({ type: 'ping', ok: true });
  });

  test('handles invalid /json payloads', () => {
    const parsed = parseSlashCommand('/json {"type":');
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error).toContain('Invalid JSON');
  });

  test('parses /close and /ping', () => {
    const close = parseSlashCommand('/close 1000 "done"');
    expect(close.ok).toBe(true);
    if (!close.ok) return;
    expect(close.command.kind).toBe('close');
    if (close.command.kind !== 'close') return;
    expect(close.command.code).toBe(1000);
    expect(close.command.reason).toBe('done');

    const ping = parseSlashCommand('/ping');
    expect(ping.ok).toBe(true);
    if (!ping.ok) return;
    expect(ping.command.kind).toBe('ping');
  });
});

describe('ws event renderers', () => {
  test('renders human prefixes', () => {
    const outbound = renderHumanEvent(
      {
        type: 'ws.outbound',
        ts: 1,
        payload: 'hello'
      },
      { colorEnabled: false, verbose: false }
    );
    const inbound = renderHumanEvent(
      {
        type: 'ws.inbound',
        ts: 2,
        payload: 'world'
      },
      { colorEnabled: false, verbose: false }
    );

    expect(outbound).toBe('> hello');
    expect(inbound).toBe('< world');
  });

  test('renders NDJSON with stable event type', () => {
    const line = renderNdjsonEvent({
      type: 'meta.summary',
      ts: 3,
      durationMs: 10,
      sent: 1,
      received: 1,
      failed: false
    });
    expect(line).toContain('"type":"meta.summary"');
    expect(line).toContain('"sent":1');
  });
});

describe('ws integration-like command behavior', () => {
  test('dispatches slash commands to connection methods', () => {
    const connection = new FakeConnection();

    const raw = parseSlashCommand('/raw hello');
    if (!raw.ok) throw new Error(raw.error);
    applySlashCommand(connection, raw.command);

    const json = parseSlashCommand('/json {"ok":true}');
    if (!json.ok) throw new Error(json.error);
    applySlashCommand(connection, json.command);

    const ping = parseSlashCommand('/ping');
    if (!ping.ok) throw new Error(ping.error);
    applySlashCommand(connection, ping.command);

    const close = parseSlashCommand('/close 1000 done');
    if (!close.ok) throw new Error(close.error);
    applySlashCommand(connection, close.command);

    expect(connection.sentText).toEqual(['hello']);
    expect(connection.sentJson).toEqual([{ ok: true }]);
    expect(connection.pingCalls).toBe(1);
    expect(connection.closeCalls[0]).toEqual({ code: 1000, reason: 'done' });
  });

  test('batch mode sends --execute payload then closes after wait', async () => {
    const connection = new FakeConnection();
    const sleeps: number[] = [];

    const result = await runBatchSession({
      connection,
      execute: '{"ping":true}',
      inputLines: lineSource([]),
      waitSeconds: 0,
      sleep: async (ms) => {
        sleeps.push(ms);
      }
    });

    expect(connection.sentText).toEqual(['{"ping":true}']);
    expect(connection.closeCalls[0]).toEqual({ code: 1000, reason: 'done' });
    expect(result.closeRequested).toBe(true);
    expect(sleeps).toEqual([0]);
  });

  test('batch mode reads piped stdin lines and ignores empty lines', async () => {
    const connection = new FakeConnection();

    const result = await runBatchSession({
      connection,
      inputLines: lineSource(['first', '', '   ', 'second']),
      waitSeconds: 0,
      sleep: async () => {}
    });

    expect(connection.sentText).toEqual(['first', 'second']);
    expect(connection.closeCalls[0]).toEqual({ code: 1000, reason: 'done' });
    expect(result.closeRequested).toBe(true);
  });

  test('SIGINT closes session gracefully with code 1001', async () => {
    const connection = new FakeConnection();
    const signalTarget = new FakeSignalTarget();
    const stdout = createMemoryWriteStream();
    const stderr = createMemoryWriteStream();
    let fakeNow = 10_000;

    const runPromise = runWs(
      {
        url: 'ws://localhost:8080/socket',
        server: 'http://127.0.0.1:4097',
        execute: 'ping',
        wait: -1,
        json: true,
        verbose: false,
        noColor: true
      },
      {
        executeAndConnect: async () =>
          ({
            execute: {
              runId: 'run_ws_1',
              request: {
                index: 0,
                method: 'GET',
                url: 'ws://localhost:8080/socket'
              },
              resolved: {
                workspaceRoot: '/tmp',
                basePath: '/tmp'
              },
              ws: {
                wsSessionId: 'ws_test',
                downstreamPath: '/ws/session/ws_test',
                upstreamUrl: 'ws://localhost:8080/socket',
                replayBufferSize: 500,
                lastSeq: 0
              }
            } as ExecuteAndConnectRequestWsResult['execute'],
            connection
          }) as ExecuteAndConnectRequestWsResult,
        stdout: stdout.stream,
        stderr: stderr.stream,
        sleep: async () => {},
        now: () => {
          fakeNow += 1;
          return fakeNow;
        },
        signalTarget: signalTarget as Pick<NodeJS.Process, 'on' | 'removeListener'>
      }
    );

    signalTarget.emitSigint();

    const exitCode = await Promise.race([
      runPromise,
      new Promise<0 | 1>((_, reject) => {
        setTimeout(() => reject(new Error('runWs timed out')), 200);
      })
    ]);

    expect(exitCode).toBe(0);
    expect(connection.closeCalls[0]).toEqual({ code: 1001, reason: 'CLI interrupted' });
    const output = stdout.chunks.join('');
    expect(output).toContain('"type":"meta.connected"');
    expect(output).toContain('"type":"meta.closed"');
    expect(output).toContain('"type":"meta.summary"');
    expect(stderr.chunks.join('')).toBe('');
  });

  test('runWs builds file-mode execute request payload', async () => {
    const connection = new FakeConnection();
    const stdout = createMemoryWriteStream();
    const stderr = createMemoryWriteStream();
    let capturedRequest: unknown;

    const exitCode = await runWs(
      {
        file: 'collection/chat.http',
        name: 'connect',
        profile: 'dev',
        var: ['token=abc', 'region=us'],
        timeout: 2500,
        server: 'http://127.0.0.1:4097',
        execute: '{"op":"ping"}',
        wait: 0,
        json: true,
        verbose: false,
        noColor: true
      },
      {
        executeAndConnect: async (options) => {
          capturedRequest = options.request;
          return {
            execute: {
              runId: 'run_ws_file_1',
              request: {
                index: 0,
                name: 'connect',
                method: 'GET',
                url: 'wss://echo.websocket.events'
              },
              resolved: {
                workspaceRoot: '/tmp',
                basePath: '/tmp'
              },
              ws: {
                wsSessionId: 'ws_test',
                downstreamPath: '/ws/session/ws_test',
                upstreamUrl: 'wss://echo.websocket.events',
                replayBufferSize: 500,
                lastSeq: 0
              }
            } as ExecuteAndConnectRequestWsResult['execute'],
            connection
          };
        },
        stdout: stdout.stream,
        stderr: stderr.stream,
        sleep: async () => {}
      }
    );

    expect(exitCode).toBe(0);
    expect(capturedRequest).toEqual({
      path: 'collection/chat.http',
      requestName: 'connect',
      profile: 'dev',
      variables: {
        token: 'abc',
        region: 'us'
      },
      connectTimeoutMs: 2500
    });
    expect(connection.sentText).toEqual(['{"op":"ping"}']);
    expect(stderr.chunks.join('')).toBe('');
  });
});

describe('ws exit code helper', () => {
  test('maps failed state to process exit codes', () => {
    expect(resolveExitCode({ failed: false })).toBe(0);
    expect(resolveExitCode({ failed: true })).toBe(1);
  });
});
