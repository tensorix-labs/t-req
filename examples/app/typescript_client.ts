/**
 * t-req TypeScript/JavaScript Client Example
 *
 * This example demonstrates how to interact with the t-req server.
 * No special SDK required - just standard fetch!
 *
 * Start the server:
 *   treq serve
 *
 * Then run this script:
 *   bun run typescript_client.ts
 *   # or
 *   npx tsx typescript_client.ts
 */

const BASE_URL = 'http://127.0.0.1:4097';

// Types for API responses

interface HealthResponse {
  healthy: true;
  version: string;
}

interface ParsedRequestInfo {
  index: number;
  name?: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  hasBody: boolean;
  hasFormData: boolean;
  hasBodyFile: boolean;
}

interface ParseResponse {
  requests: Array<{
    request?: ParsedRequestInfo;
    diagnostics: unknown[];
  }>;
  diagnostics: unknown[];
}

interface ExecuteResponse {
  runId: string;
  request: {
    index: number;
    name?: string;
    method: string;
    url: string;
  };
  response: {
    status: number;
    statusText: string;
    headers: Array<{ name: string; value: string }>;
    bodyMode: 'buffered' | 'stream' | 'none';
    body?: string;
    encoding: 'utf-8' | 'base64';
    truncated: boolean;
    bodyBytes: number;
  };
  timing: {
    startTime: number;
    endTime: number;
    durationMs: number;
  };
}

interface SessionState {
  sessionId: string;
  variables: Record<string, unknown>;
  cookieCount: number;
  createdAt: number;
  lastUsedAt: number;
  snapshotVersion: number;
}

// Client functions

async function healthCheck(): Promise<HealthResponse> {
  const response = await fetch(`${BASE_URL}/health`);
  if (!response.ok) throw new Error(`Health check failed: ${response.statusText}`);
  return response.json();
}

async function parseHTTPContent(content: string): Promise<ParseResponse> {
  const response = await fetch(`${BASE_URL}/parse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content })
  });
  if (!response.ok) throw new Error(`Parse failed: ${response.statusText}`);
  return response.json();
}

async function executeRequest(
  content: string,
  options?: {
    variables?: Record<string, unknown>;
    sessionId?: string;
    requestName?: string;
    requestIndex?: number;
    timeoutMs?: number;
  }
): Promise<ExecuteResponse> {
  const payload: Record<string, unknown> = { content };
  if (options?.variables) payload.variables = options.variables;
  if (options?.sessionId) payload.sessionId = options.sessionId;
  if (options?.requestName) payload.requestName = options.requestName;
  if (options?.requestIndex !== undefined) payload.requestIndex = options.requestIndex;
  if (options?.timeoutMs) payload.timeoutMs = options.timeoutMs;

  const response = await fetch(`${BASE_URL}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(`Execute failed: ${response.statusText}`);
  return response.json();
}

async function createSession(variables?: Record<string, unknown>): Promise<string> {
  const response = await fetch(`${BASE_URL}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ variables })
  });
  if (!response.ok) throw new Error(`Create session failed: ${response.statusText}`);
  const result = await response.json();
  return result.sessionId;
}

async function getSession(sessionId: string): Promise<SessionState> {
  const response = await fetch(`${BASE_URL}/session/${sessionId}`);
  if (!response.ok) throw new Error(`Get session failed: ${response.statusText}`);
  return response.json();
}

async function updateSessionVariables(
  sessionId: string,
  variables: Record<string, unknown>,
  mode: 'merge' | 'replace' = 'merge'
): Promise<void> {
  const response = await fetch(`${BASE_URL}/session/${sessionId}/variables`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ variables, mode })
  });
  if (!response.ok) throw new Error(`Update variables failed: ${response.statusText}`);
}

async function deleteSession(sessionId: string): Promise<void> {
  const response = await fetch(`${BASE_URL}/session/${sessionId}`, {
    method: 'DELETE'
  });
  if (!response.ok) throw new Error(`Delete session failed: ${response.statusText}`);
}

// SSE Event subscription using EventSource
export function subscribeToEvents(
  sessionId?: string,
  onEvent?: (event: { type: string; data: unknown }) => void
): EventSource {
  const url = sessionId ? `${BASE_URL}/event?sessionId=${sessionId}` : `${BASE_URL}/event`;
  const eventSource = new EventSource(url);

  eventSource.onmessage = (event) => {
    onEvent?.({ type: 'message', data: JSON.parse(event.data) });
  };

  eventSource.addEventListener('connected', (event) => {
    onEvent?.({ type: 'connected', data: JSON.parse((event as MessageEvent).data) });
  });

  eventSource.addEventListener('parseStarted', (event) => {
    onEvent?.({ type: 'parseStarted', data: JSON.parse((event as MessageEvent).data) });
  });

  eventSource.addEventListener('fetchFinished', (event) => {
    onEvent?.({ type: 'fetchFinished', data: JSON.parse((event as MessageEvent).data) });
  });

  eventSource.onerror = () => {
    onEvent?.({ type: 'error', data: null });
  };

  return eventSource;
}

// Example usage
async function main() {
  console.log('=== t-req TypeScript Client Example ===\n');

  // 1. Health check
  console.log('1. Health check:');
  const health = await healthCheck();
  console.log(`   Healthy: ${health.healthy}`);
  console.log(`   Version: ${health.version}`);
  console.log();

  // 2. Parse a simple request
  console.log('2. Parse request:');
  const httpContent = `
GET https://jsonplaceholder.typicode.com/posts/1
Accept: application/json
`;
  const parsed = await parseHTTPContent(httpContent);
  console.log(`   Found ${parsed.requests.length} request(s)`);
  if (parsed.requests[0]?.request) {
    const req = parsed.requests[0].request;
    console.log(`   Method: ${req.method}, URL: ${req.url}`);
  }
  console.log();

  // 3. Execute a request
  console.log('3. Execute request:');
  const result = await executeRequest(httpContent);
  console.log(`   Status: ${result.response.status} ${result.response.statusText}`);
  console.log(`   Duration: ${result.timing.durationMs}ms`);
  console.log(`   Body size: ${result.response.bodyBytes} bytes`);
  console.log();

  // 4. Session management
  console.log('4. Session management:');
  const sessionId = await createSession({ baseUrl: 'https://jsonplaceholder.typicode.com' });
  console.log(`   Created session: ${sessionId}`);

  let sessionState = await getSession(sessionId);
  console.log(`   Variables:`, sessionState.variables);

  await updateSessionVariables(sessionId, { token: 'abc123' });
  sessionState = await getSession(sessionId);
  console.log(`   After update:`, sessionState.variables);

  await deleteSession(sessionId);
  console.log('   Session deleted');
  console.log();

  // 5. Execute with variables
  console.log('5. Execute with variables:');
  const httpWithVars = `
GET {{baseUrl}}/users/{{userId}}
Accept: application/json
`;
  const resultWithVars = await executeRequest(httpWithVars, {
    variables: {
      baseUrl: 'https://jsonplaceholder.typicode.com',
      userId: '1'
    }
  });
  console.log(`   Status: ${resultWithVars.response.status}`);
  console.log(`   Request URL: ${resultWithVars.request.url}`);
  console.log();

  console.log('=== Done ===');
}

main().catch(console.error);
