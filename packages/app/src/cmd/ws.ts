import { createInterface } from 'node:readline';
import {
  createTreqClient,
  type ExecuteAndConnectRequestWsResult,
  executeAndConnectRequestWs,
  type RequestWsSessionConnection,
  type WsSessionServerEnvelope
} from '@t-req/sdk/client';
import type { CommandModule } from 'yargs';
import { ANSI, useColor } from '../utils';

const DEFAULT_SERVER_URL = 'http://127.0.0.1:4097';
const DEFAULT_BATCH_WAIT_SECONDS = 2;
const CLOSE_DRAIN_TIMEOUT_MS = 1500;
const SIGINT_CLOSE_REASON = 'CLI interrupted';

interface WsOptions {
  url?: string;
  file?: string;
  name?: string;
  index?: number;
  profile?: string;
  var?: string[];
  server: string;
  token?: string;
  timeout?: number;
  execute?: string;
  wait?: number;
  json?: boolean;
  verbose?: boolean;
  noColor?: boolean;
}

export interface WsCommandDeps {
  createClient?: typeof createTreqClient;
  executeAndConnect?: (
    options: Parameters<typeof executeAndConnectRequestWs>[0]
  ) => Promise<ExecuteAndConnectRequestWsResult>;
  stdin?: NodeJS.ReadStream;
  stdout?: NodeJS.WriteStream;
  stderr?: NodeJS.WriteStream;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  signalTarget?: Pick<NodeJS.Process, 'on' | 'removeListener'>;
}

export type WsCliEvent =
  | {
      type: 'meta.connected';
      ts: number;
      url: string;
      wsSessionId: string;
      subprotocol?: string;
    }
  | {
      type: 'ws.outbound';
      ts: number;
      payloadType?: string;
      payload?: unknown;
    }
  | {
      type: 'ws.inbound';
      ts: number;
      payloadType?: string;
      payload?: unknown;
    }
  | {
      type: 'ws.error';
      ts: number;
      code?: string;
      message: string;
      payload?: unknown;
    }
  | {
      type: 'meta.closed';
      ts: number;
      code: number;
      reason: string;
      wasClean?: boolean;
    }
  | {
      type: 'meta.summary';
      ts: number;
      durationMs: number;
      sent: number;
      received: number;
      failed: boolean;
    };

export type SlashCommand =
  | { kind: 'help' }
  | { kind: 'ping' }
  | { kind: 'close'; code: number; reason: string }
  | { kind: 'json'; payload: unknown }
  | { kind: 'raw'; payload: string };

export type SlashCommandParseResult =
  | { ok: true; command: SlashCommand }
  | { ok: false; error: string };

interface WsRunState {
  startTime: number;
  sent: number;
  received: number;
  failed: boolean;
  closed: boolean;
  closeRequested: boolean;
}

interface InteractiveOptions {
  argv: WsOptions;
  connection: RequestWsSessionConnection;
  consumePromise: Promise<void>;
  state: WsRunState;
  stdin: NodeJS.ReadStream;
  stdout: NodeJS.WriteStream;
  colorEnabled: boolean;
  sleep: (ms: number) => Promise<void>;
}

export interface RunBatchSessionOptions {
  connection: Pick<RequestWsSessionConnection, 'sendText' | 'close' | 'disconnect'>;
  execute?: string;
  inputLines: AsyncIterable<string>;
  waitSeconds: number;
  sleep: (ms: number) => Promise<void>;
}

export interface RunBatchSessionResult {
  closeRequested: boolean;
}

export const wsCommand: CommandModule<object, WsOptions> = {
  command: 'ws [url]',
  describe: 'Open a WebSocket request session through a running t-req server',
  builder: (yargs) =>
    yargs
      .positional('url', {
        type: 'string',
        describe: 'WebSocket URL (ws:// or wss://)'
      })
      .option('file', {
        type: 'string',
        alias: 'f',
        describe: 'Path to .http file containing a WebSocket request'
      })
      .option('name', {
        type: 'string',
        alias: 'n',
        describe: 'Select request by @name directive (file mode)'
      })
      .option('index', {
        type: 'number',
        alias: 'i',
        describe: 'Select request by index (0-based, file mode)'
      })
      .option('profile', {
        type: 'string',
        alias: 'p',
        describe: 'Config profile to use'
      })
      .option('var', {
        type: 'array',
        string: true,
        alias: 'v',
        describe: 'Variables in format key=value'
      })
      .option('server', {
        type: 'string',
        alias: 's',
        default: DEFAULT_SERVER_URL,
        describe: 'Server URL to connect to'
      })
      .option('token', {
        type: 'string',
        alias: 't',
        describe: 'Bearer token for authentication'
      })
      .option('timeout', {
        type: 'number',
        describe: 'WebSocket connect timeout in milliseconds'
      })
      .option('execute', {
        type: 'string',
        alias: 'x',
        describe: 'Send one message and then wait/exit'
      })
      .option('wait', {
        type: 'number',
        alias: 'w',
        describe: 'Wait seconds before closing in batch mode (-1 waits indefinitely)'
      })
      .option('json', {
        type: 'boolean',
        default: false,
        describe: 'Output live events as NDJSON'
      })
      .option('verbose', {
        type: 'boolean',
        default: false,
        describe: 'Show verbose output'
      })
      .option('no-color', {
        type: 'boolean',
        default: false,
        describe: 'Disable colored output'
      }),
  handler: async (argv) => {
    const exitCode = await runWs(argv);
    if (exitCode !== 0) {
      process.exit(exitCode);
    }
  }
};

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function writeLine(stream: NodeJS.WriteStream, line: string): void {
  stream.write(`${line}\n`);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function stringifyPayload(payload: unknown): string {
  if (typeof payload === 'string') return payload;
  if (payload === undefined) return '';
  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
}

function prefix(symbol: '>' | '<' | '!' | '~', colorEnabled: boolean): string {
  if (!colorEnabled) return symbol;
  switch (symbol) {
    case '>':
      return `${ANSI.blue}>${ANSI.reset}`;
    case '<':
      return `${ANSI.bold}<${ANSI.reset}`;
    case '!':
      return `${ANSI.yellow}!${ANSI.reset}`;
    case '~':
      return `${ANSI.dim}~${ANSI.reset}`;
    default:
      return symbol;
  }
}

export function renderNdjsonEvent(event: WsCliEvent): string {
  return JSON.stringify(event);
}

export function renderHumanEvent(
  event: WsCliEvent,
  options: { colorEnabled: boolean; verbose: boolean }
): string | undefined {
  switch (event.type) {
    case 'meta.connected': {
      const subprotocol = event.subprotocol ? ` (subprotocol: ${event.subprotocol})` : '';
      return `${prefix('!', options.colorEnabled)} Connected to ${event.url}${subprotocol}`;
    }
    case 'ws.outbound':
      return `${prefix('>', options.colorEnabled)} ${stringifyPayload(event.payload)}`;
    case 'ws.inbound':
      return `${prefix('<', options.colorEnabled)} ${stringifyPayload(event.payload)}`;
    case 'ws.error': {
      const code = event.code ? `[${event.code}] ` : '';
      const payload =
        options.verbose && event.payload !== undefined
          ? ` payload=${stringifyPayload(event.payload)}`
          : '';
      return `${prefix('!', options.colorEnabled)} ${code}${event.message}${payload}`;
    }
    case 'meta.closed':
      return `${prefix('!', options.colorEnabled)} Connection closed (code: ${event.code}, reason: ${event.reason})`;
    case 'meta.summary':
      return `${prefix('!', options.colorEnabled)} Duration: ${event.durationMs}ms Messages: sent=${event.sent}, received=${event.received}`;
    default:
      return undefined;
  }
}

function createEventEmitter(
  argv: WsOptions,
  stdout: NodeJS.WriteStream,
  colorEnabled: boolean
): (event: WsCliEvent) => void {
  return (event: WsCliEvent) => {
    if (argv.json) {
      writeLine(stdout, renderNdjsonEvent(event));
      return;
    }

    const line = renderHumanEvent(event, {
      colorEnabled,
      verbose: argv.verbose === true
    });
    if (line) {
      writeLine(stdout, line);
    }
  };
}

function emitLocalInfo(
  argv: WsOptions,
  stdout: NodeJS.WriteStream,
  colorEnabled: boolean,
  message: string
): void {
  if (argv.json) return;
  writeLine(stdout, `${prefix('!', colorEnabled)} ${message}`);
}

function emitVerboseFrame(
  argv: WsOptions,
  stdout: NodeJS.WriteStream,
  colorEnabled: boolean,
  frame: string
): void {
  if (argv.json || !argv.verbose) return;
  writeLine(stdout, `${prefix('~', colorEnabled)} ${frame}`);
}

export function resolveBatchWaitSeconds(wait: number | undefined): number {
  if (wait === undefined) return DEFAULT_BATCH_WAIT_SECONDS;
  if (!Number.isFinite(wait)) {
    throw new Error('--wait must be a finite number');
  }
  if (!Number.isInteger(wait)) {
    throw new Error('--wait must be an integer');
  }
  if (wait < -1) {
    throw new Error('--wait must be -1 or a non-negative integer');
  }
  return wait;
}

export function parseWsVariables(vars: string[] | undefined): Record<string, string> {
  if (!vars) return {};

  const result: Record<string, string> = {};
  for (const entry of vars) {
    const eqIndex = entry.indexOf('=');
    if (eqIndex === -1) {
      console.warn(`Warning: Invalid variable format "${entry}", expected key=value`);
      continue;
    }

    const key = entry.slice(0, eqIndex).trim();
    const value = entry.slice(eqIndex + 1);
    if (!key) {
      console.warn(`Warning: Invalid variable key in "${entry}", key cannot be empty`);
      continue;
    }
    result[key] = value;
  }

  return result;
}

function validateWsUrl(url: string | undefined): string {
  if (url === undefined) {
    throw new Error('WebSocket URL is required');
  }

  const trimmed = url.trim();
  if (!trimmed) {
    throw new Error('WebSocket URL is required');
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }

  if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
    throw new Error('URL must use ws:// or wss://');
  }

  return trimmed;
}

export interface ValidatedWsArgs {
  source: 'url' | 'file';
  target: string;
  executeRequest: Parameters<typeof executeAndConnectRequestWs>[0]['request'];
  waitSeconds: number;
}

export function validateWsArgs(
  argv: Pick<WsOptions, 'url' | 'file' | 'name' | 'index' | 'profile' | 'var' | 'timeout' | 'wait'>
): ValidatedWsArgs {
  if (argv.timeout !== undefined) {
    if (!Number.isFinite(argv.timeout) || !Number.isInteger(argv.timeout)) {
      throw new Error('--timeout must be an integer');
    }
    if (argv.timeout < 100) {
      throw new Error('--timeout must be at least 100ms');
    }
  }

  if (argv.name !== undefined && argv.index !== undefined) {
    throw new Error('Cannot specify both --name and --index');
  }

  if (argv.index !== undefined) {
    if (!Number.isInteger(argv.index) || argv.index < 0) {
      throw new Error('--index must be a non-negative integer');
    }
  }

  const hasUrl = argv.url !== undefined && argv.url.trim().length > 0;
  const hasFile = argv.file !== undefined && argv.file.trim().length > 0;

  if (hasUrl && hasFile) {
    throw new Error('Specify either URL positional argument or --file, not both');
  }

  if (!hasUrl && !hasFile) {
    throw new Error('Provide either a WebSocket URL or --file');
  }

  if ((argv.name !== undefined || argv.index !== undefined) && !hasFile) {
    throw new Error('--name and --index require --file mode');
  }

  const waitSeconds = resolveBatchWaitSeconds(argv.wait);
  const cliVariables = parseWsVariables(argv.var);

  const baseRequest: Record<string, unknown> = {
    ...(argv.timeout !== undefined ? { connectTimeoutMs: argv.timeout } : {}),
    ...(argv.profile !== undefined ? { profile: argv.profile } : {}),
    ...(Object.keys(cliVariables).length > 0 ? { variables: cliVariables } : {})
  };

  if (hasFile) {
    const filePath = argv.file?.trim();
    if (!filePath) {
      throw new Error('--file cannot be empty');
    }

    return {
      source: 'file',
      target: filePath,
      executeRequest: {
        path: filePath,
        ...(argv.name !== undefined ? { requestName: argv.name } : {}),
        ...(argv.index !== undefined ? { requestIndex: argv.index } : {}),
        ...baseRequest
      },
      waitSeconds
    };
  }

  const url = validateWsUrl(argv.url);
  return {
    source: 'url',
    target: url,
    executeRequest: {
      content: `# @ws\nGET ${url}\n`,
      ...baseRequest
    },
    waitSeconds
  };
}

function stripSurroundingQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

export function parseSlashCommand(input: string): SlashCommandParseResult {
  const trimmed = input.trim();
  const [headRaw, ...args] = trimmed.split(/\s+/);
  const head = headRaw?.toLowerCase();

  if (head === '/help') {
    return { ok: true, command: { kind: 'help' } };
  }
  if (head === '/ping') {
    return { ok: true, command: { kind: 'ping' } };
  }
  if (head === '/close') {
    let code = 1000;
    if (args[0] !== undefined) {
      const parsed = Number.parseInt(args[0], 10);
      if (Number.isNaN(parsed) || parsed < 0 || parsed > 4999) {
        return { ok: false, error: 'Invalid close code. Expected integer 0-4999.' };
      }
      code = parsed;
    }
    const reason = stripSurroundingQuotes(args.slice(1).join(' '));
    return { ok: true, command: { kind: 'close', code, reason } };
  }
  if (head === '/json') {
    const payloadText = trimmed.slice('/json'.length).trim();
    if (!payloadText) {
      return { ok: false, error: 'Usage: /json <valid-json>' };
    }
    try {
      return { ok: true, command: { kind: 'json', payload: JSON.parse(payloadText) } };
    } catch {
      return { ok: false, error: 'Invalid JSON payload for /json' };
    }
  }
  if (head === '/raw') {
    const payload = trimmed.slice('/raw'.length).trimStart();
    return { ok: true, command: { kind: 'raw', payload } };
  }

  return { ok: false, error: `Unknown command: ${headRaw ?? ''}` };
}

export function applySlashCommand(
  connection: Pick<RequestWsSessionConnection, 'sendText' | 'sendJson' | 'ping' | 'close'>,
  command: SlashCommand
): { closeRequested: boolean; help?: string; pingSent: boolean } {
  switch (command.kind) {
    case 'help':
      return {
        closeRequested: false,
        pingSent: false,
        help: 'Commands: /help, /ping, /close [code] [reason], /json <data>, /raw <data>'
      };
    case 'ping':
      connection.ping();
      return { closeRequested: false, pingSent: true };
    case 'close':
      connection.close(command.code, command.reason);
      return { closeRequested: true, pingSent: false };
    case 'json':
      connection.sendJson(command.payload);
      return { closeRequested: false, pingSent: false };
    case 'raw':
      connection.sendText(command.payload);
      return { closeRequested: false, pingSent: false };
    default:
      return { closeRequested: false, pingSent: false };
  }
}

function parseCloseEnvelopePayload(payload: unknown): {
  code: number;
  reason: string;
  wasClean?: boolean;
} {
  if (!isRecord(payload)) {
    return { code: 1000, reason: '' };
  }

  const codeRaw = payload.code;
  const reasonRaw = payload.reason;
  const wasCleanRaw = payload.wasClean;

  const code = typeof codeRaw === 'number' ? codeRaw : 1000;
  const reason = typeof reasonRaw === 'string' ? reasonRaw : '';
  const wasClean = typeof wasCleanRaw === 'boolean' ? wasCleanRaw : undefined;

  return { code, reason, wasClean };
}

function mapEnvelopeToEvent(envelope: WsSessionServerEnvelope): WsCliEvent | undefined {
  if (envelope.type === 'session.outbound') {
    return {
      type: 'ws.outbound',
      ts: envelope.ts,
      payloadType: envelope.payloadType,
      payload: envelope.payload
    };
  }

  if (envelope.type === 'session.inbound') {
    return {
      type: 'ws.inbound',
      ts: envelope.ts,
      payloadType: envelope.payloadType,
      payload: envelope.payload
    };
  }

  if (envelope.type === 'session.error') {
    return {
      type: 'ws.error',
      ts: envelope.ts,
      code: envelope.error?.code,
      message: envelope.error?.message ?? 'WebSocket session error',
      payload: envelope.payload
    };
  }

  if (envelope.type === 'session.closed') {
    const closePayload = parseCloseEnvelopePayload(envelope.payload);
    return {
      type: 'meta.closed',
      ts: envelope.ts,
      code: closePayload.code,
      reason: closePayload.reason,
      ...(closePayload.wasClean !== undefined ? { wasClean: closePayload.wasClean } : {})
    };
  }

  return undefined;
}

async function consumeConnection(
  connection: RequestWsSessionConnection,
  state: WsRunState,
  emit: (event: WsCliEvent) => void,
  now: () => number
): Promise<void> {
  let emittedTerminalError = false;
  try {
    for await (const envelope of connection) {
      const mapped = mapEnvelopeToEvent(envelope);
      if (!mapped) continue;

      if (mapped.type === 'ws.outbound') {
        state.sent++;
      } else if (mapped.type === 'ws.inbound') {
        state.received++;
      } else if (mapped.type === 'ws.error') {
        state.failed = true;
      } else if (mapped.type === 'meta.closed') {
        state.closed = true;
      }

      emit(mapped);

      if (envelope.type === 'session.closed') {
        break;
      }
    }
  } catch (error) {
    if (!state.closed && !state.closeRequested) {
      state.failed = true;
      emittedTerminalError = true;
      emit({
        type: 'ws.error',
        ts: now(),
        code: 'WS_CONTROL_SOCKET_ERROR',
        message: errorMessage(error)
      });
    }
  } finally {
    if (!state.closed && !state.closeRequested && !emittedTerminalError) {
      state.failed = true;
      emit({
        type: 'ws.error',
        ts: now(),
        code: 'WS_CONTROL_SOCKET_CLOSED',
        message: 'Control socket closed unexpectedly'
      });
    }
  }
}

export async function closeSessionGracefully(
  connection: Pick<RequestWsSessionConnection, 'close' | 'disconnect'>,
  options: {
    code?: number;
    reason?: string;
    forceDisconnectAfterMs?: number;
    sleep?: (ms: number) => Promise<void>;
  } = {}
): Promise<void> {
  const code = options.code ?? 1000;
  const reason = options.reason ?? '';
  const sleep = options.sleep ?? sleepMs;

  try {
    connection.close(code, reason);
  } catch {
    // no-op
  }

  if (options.forceDisconnectAfterMs !== undefined) {
    await sleep(options.forceDisconnectAfterMs);
    try {
      connection.disconnect(code, reason);
    } catch {
      // no-op
    }
  }
}

async function* emptyLineSource(): AsyncGenerator<string> {
  // Intentional empty generator.
}

async function* streamLines(stream: NodeJS.ReadStream): AsyncGenerator<string> {
  const rl = createInterface({
    input: stream,
    crlfDelay: Number.POSITIVE_INFINITY
  });

  try {
    for await (const line of rl) {
      yield line;
    }
  } finally {
    rl.close();
  }
}

async function waitForDrain(
  consumePromise: Promise<void>,
  connection: Pick<RequestWsSessionConnection, 'disconnect'>,
  sleep: (ms: number) => Promise<void>
): Promise<void> {
  let drained = false;
  await Promise.race([
    consumePromise.then(() => {
      drained = true;
    }),
    sleep(CLOSE_DRAIN_TIMEOUT_MS)
  ]);

  if (!drained) {
    try {
      connection.disconnect(1000, 'Client closing');
    } catch {
      // no-op
    }
  }

  await consumePromise;
}

async function runInteractiveSession(options: InteractiveOptions): Promise<void> {
  const { argv, connection, consumePromise, state, stdin, stdout, colorEnabled, sleep } = options;

  emitLocalInfo(
    argv,
    stdout,
    colorEnabled,
    'Type messages to send. Commands: /help, /ping, /close, /json, /raw'
  );

  const rl = createInterface({
    input: stdin,
    output: stdout,
    terminal: true
  });
  rl.setPrompt('> ');
  rl.prompt();

  let handling = Promise.resolve();
  let closingByConnection = false;

  const handleLine = async (line: string): Promise<void> => {
    if (state.closed || state.closeRequested) {
      return;
    }

    if (line.trim().startsWith('/')) {
      const parsed = parseSlashCommand(line);
      if (!parsed.ok) {
        emitLocalInfo(argv, stdout, colorEnabled, parsed.error);
        rl.prompt();
        return;
      }

      const result = applySlashCommand(connection, parsed.command);
      if (result.help) {
        emitLocalInfo(argv, stdout, colorEnabled, result.help);
      }
      if (result.pingSent) {
        emitVerboseFrame(argv, stdout, colorEnabled, 'ping');
      }
      if (result.closeRequested) {
        state.closeRequested = true;
      }
    } else if (line.trim().length > 0) {
      connection.sendText(line);
    }

    if (!state.closed && !state.closeRequested) {
      rl.prompt();
    } else {
      rl.close();
    }
  };

  void consumePromise.finally(() => {
    closingByConnection = true;
    rl.close();
  });

  rl.on('line', (line) => {
    handling = handling.then(async () => {
      await handleLine(line);
    });
  });

  await new Promise<void>((resolve) => {
    rl.once('close', () => resolve());
  });
  await handling;

  if (!closingByConnection && !state.closed && !state.closeRequested) {
    state.closeRequested = true;
    await closeSessionGracefully(connection, {
      code: 1000,
      reason: 'stdin ended',
      forceDisconnectAfterMs: CLOSE_DRAIN_TIMEOUT_MS,
      sleep
    });
  }
}

export async function runBatchSession(
  options: RunBatchSessionOptions
): Promise<RunBatchSessionResult> {
  const { connection, execute, inputLines, waitSeconds, sleep } = options;

  if (execute !== undefined) {
    connection.sendText(execute);
  } else {
    for await (const line of inputLines) {
      if (line.trim().length === 0) continue;
      connection.sendText(line);
    }
  }

  if (waitSeconds === -1) {
    return { closeRequested: false };
  }

  await sleep(waitSeconds * 1000);
  await closeSessionGracefully(connection, {
    code: 1000,
    reason: 'done'
  });
  return { closeRequested: true };
}

export function resolveExitCode(state: Pick<WsRunState, 'failed'>): 0 | 1 {
  return state.failed ? 1 : 0;
}

export async function runWs(argv: WsOptions, deps: WsCommandDeps = {}): Promise<0 | 1> {
  const createClient = deps.createClient ?? createTreqClient;
  const executeAndConnect = deps.executeAndConnect ?? executeAndConnectRequestWs;
  const stdin = deps.stdin ?? process.stdin;
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;
  const sleep = deps.sleep ?? sleepMs;
  const now = deps.now ?? Date.now;
  const signalTarget = deps.signalTarget ?? process;
  const colorEnabled = useColor() && !argv.noColor;
  const emit = createEventEmitter(argv, stdout, colorEnabled);

  const state: WsRunState = {
    startTime: now(),
    sent: 0,
    received: 0,
    failed: false,
    closed: false,
    closeRequested: false
  };

  let validatedTarget = '';
  let executeRequest: Parameters<typeof executeAndConnectRequestWs>[0]['request'] | undefined;
  let waitSeconds = DEFAULT_BATCH_WAIT_SECONDS;

  try {
    const validated = validateWsArgs(argv);
    validatedTarget = validated.target;
    executeRequest = validated.executeRequest;
    waitSeconds = validated.waitSeconds;
  } catch (error) {
    state.failed = true;
    emit({
      type: 'ws.error',
      ts: now(),
      code: 'WS_INVALID_ARGS',
      message: errorMessage(error)
    });
    emit({
      type: 'meta.summary',
      ts: now(),
      durationMs: now() - state.startTime,
      sent: state.sent,
      received: state.received,
      failed: true
    });
    writeLine(stderr, errorMessage(error));
    return 1;
  }

  const client = createClient({
    baseUrl: argv.server,
    ...(argv.token ? { token: argv.token } : {})
  });

  if (!executeRequest) {
    state.failed = true;
    emit({
      type: 'ws.error',
      ts: now(),
      code: 'WS_INVALID_ARGS',
      message: 'Missing execute request payload'
    });
    emit({
      type: 'meta.summary',
      ts: now(),
      durationMs: now() - state.startTime,
      sent: state.sent,
      received: state.received,
      failed: true
    });
    return 1;
  }

  let connection: RequestWsSessionConnection;
  let executeResult: ExecuteAndConnectRequestWsResult['execute'];
  try {
    const result = await executeAndConnect({
      client,
      request: executeRequest
    });
    connection = result.connection;
    executeResult = result.execute;
  } catch (error) {
    state.failed = true;
    emit({
      type: 'ws.error',
      ts: now(),
      code: 'WS_CONNECT_FAILED',
      message: `Failed to open ${validatedTarget}: ${errorMessage(error)}`
    });
    emit({
      type: 'meta.summary',
      ts: now(),
      durationMs: now() - state.startTime,
      sent: state.sent,
      received: state.received,
      failed: true
    });
    return 1;
  }

  emit({
    type: 'meta.connected',
    ts: now(),
    url: executeResult.ws.upstreamUrl,
    wsSessionId: executeResult.ws.wsSessionId,
    ...(executeResult.ws.subprotocol ? { subprotocol: executeResult.ws.subprotocol } : {})
  });

  const consumePromise = consumeConnection(connection, state, emit, now);

  const onSigint = () => {
    if (state.closeRequested || state.closed) return;
    state.closeRequested = true;
    emitLocalInfo(argv, stdout, colorEnabled, 'SIGINT received, closing session...');
    void closeSessionGracefully(connection, {
      code: 1001,
      reason: SIGINT_CLOSE_REASON,
      forceDisconnectAfterMs: 250,
      sleep
    });
  };

  signalTarget.on('SIGINT', onSigint);

  try {
    const interactiveMode = argv.execute === undefined && stdin.isTTY === true;
    if (interactiveMode) {
      await runInteractiveSession({
        argv,
        connection,
        consumePromise,
        state,
        stdin,
        stdout,
        colorEnabled,
        sleep
      });
      if (state.closeRequested && !state.closed) {
        await waitForDrain(consumePromise, connection, sleep);
      } else {
        await consumePromise;
      }
    } else {
      const inputLines = argv.execute !== undefined ? emptyLineSource() : streamLines(stdin);
      const batchResult = await runBatchSession({
        connection,
        execute: argv.execute,
        inputLines,
        waitSeconds,
        sleep
      });

      if (batchResult.closeRequested) {
        state.closeRequested = true;
        if (!state.closed) {
          await waitForDrain(consumePromise, connection, sleep);
        } else {
          await consumePromise;
        }
      } else {
        await consumePromise;
      }
    }
  } finally {
    signalTarget.removeListener('SIGINT', onSigint);
  }

  emit({
    type: 'meta.summary',
    ts: now(),
    durationMs: now() - state.startTime,
    sent: state.sent,
    received: state.received,
    failed: state.failed
  });

  return resolveExitCode(state);
}
