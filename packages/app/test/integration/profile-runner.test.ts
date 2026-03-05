import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { createApp, type ServerConfig } from '../../src/server/app';
import type { EventEnvelope } from '../../src/server/events';

type TestApp = ReturnType<typeof createApp>;
const clientModuleUrl = new URL('../../../core/src/client.ts', import.meta.url).href;

async function getAvailablePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Failed to resolve an available port'));
        return;
      }
      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
    server.on('error', reject);
  });
}

async function writeWorkspaceFile(
  workspaceRoot: string,
  relativePath: string,
  content: string
): Promise<void> {
  const absolutePath = join(workspaceRoot, relativePath);
  await Bun.write(absolutePath, content);
}

async function waitForFlowEvent(
  eventManager: TestApp['eventManager'],
  flowId: string,
  eventType: string
): Promise<EventEnvelope> {
  const timeoutAt = Date.now() + 10000;

  while (Date.now() < timeoutAt) {
    const event = eventManager.replay(undefined, flowId).find((entry) => entry.type === eventType);

    if (event) {
      return event;
    }

    await Bun.sleep(50);
  }

  throw new Error(`Timed out waiting for ${eventType} for flow ${flowId}`);
}

function createTestConfig(workspaceRoot: string, port: number, profile?: string): ServerConfig {
  return {
    workspace: workspaceRoot,
    port,
    host: '127.0.0.1',
    profile,
    maxBodyBytes: 1024 * 1024,
    maxSessions: 10
  };
}

function buildRunnerScriptSource(): string {
  return `import { createClient } from '${clientModuleUrl}';

const client = createClient({ server: process.env.TREQ_SERVER });
const response = await client.run('profile.http');

if (!response.ok) {
  throw new Error(\`Unexpected status: \${response.status}\`);
}

await client.close();
`;
}

function buildRunnerTestSource(): string {
  return `import { expect, test } from 'bun:test';
import { createClient } from '${clientModuleUrl}';

test('uses the active profile', async () => {
  const client = createClient({ server: process.env.TREQ_SERVER });
  const response = await client.run('profile.http');

  expect(response.status).toBe(200);

  await client.close();
});
`;
}

describe('Runner profile propagation', () => {
  let workspaceRoot = '';
  let appPort = 0;
  let appResult: TestApp | undefined;
  let appServer: Bun.Server | undefined;
  let upstreamServer: Bun.Server | undefined;

  function getAppResult(): TestApp {
    if (!appResult) {
      throw new Error('App is not running');
    }
    return appResult;
  }

  async function startApp(profile?: string): Promise<void> {
    appResult = createApp(createTestConfig(workspaceRoot, appPort, profile));
    appServer = Bun.serve({
      fetch: appResult.app.fetch,
      websocket: appResult.websocket,
      port: appPort,
      hostname: '127.0.0.1'
    });
  }

  async function stopApp(): Promise<void> {
    appServer?.stop(true);
    appServer = undefined;

    if (!appResult) {
      return;
    }

    appResult.eventManager.closeAll();
    await appResult.service.dispose();
    appResult.dispose();
    appResult = undefined;
  }

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(join(dirname(import.meta.dir), 'tmp-profile-runner-'));
    appPort = await getAvailablePort();

    upstreamServer = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      fetch(req) {
        return new Response(
          JSON.stringify({
            path: new URL(req.url).pathname
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }
    });

    await writeWorkspaceFile(
      workspaceRoot,
      'treq.jsonc',
      `{
  "profiles": {
    "playground": {
      "variables": {
        "baseUrl": "http://127.0.0.1:${upstreamServer.port}"
      }
    }
  }
}
`
    );

    await writeWorkspaceFile(
      workspaceRoot,
      'profile.http',
      `GET {{baseUrl}}/profile-check
`
    );
    await startApp();
  });

  afterEach(async () => {
    await stopApp();
    upstreamServer?.stop(true);

    if (workspaceRoot) {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  test('POST /script applies a profile-only baseUrl for spawned clients', async () => {
    await writeWorkspaceFile(workspaceRoot, 'runner-script.ts', buildRunnerScriptSource());

    const response = await fetch(`http://127.0.0.1:${appPort}/script`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filePath: 'runner-script.ts',
        runnerId: 'bun',
        profile: 'playground'
      })
    });

    const data = (await response.json()) as { flowId: string; runId: string };
    expect(response.status).toBe(200);
    expect(data.flowId).toBeDefined();
    expect(data.runId).toBeDefined();

    const finished = await waitForFlowEvent(
      getAppResult().eventManager,
      data.flowId,
      'scriptFinished'
    );
    expect(finished.payload.exitCode).toBe(0);
  });

  test('POST /test applies a profile-only baseUrl for spawned clients', async () => {
    await writeWorkspaceFile(workspaceRoot, 'runner.test.ts', buildRunnerTestSource());

    const response = await fetch(`http://127.0.0.1:${appPort}/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filePath: 'runner.test.ts',
        frameworkId: 'bun',
        profile: 'playground'
      })
    });

    const data = (await response.json()) as { flowId: string; runId: string };
    expect(response.status).toBe(200);
    expect(data.flowId).toBeDefined();
    expect(data.runId).toBeDefined();

    const finished = await waitForFlowEvent(
      getAppResult().eventManager,
      data.flowId,
      'testFinished'
    );
    expect(finished.payload.exitCode).toBe(0);
    expect(finished.payload.status).toBe('passed');
  });

  test('POST /script falls back to the server default profile when request.profile is omitted', async () => {
    await stopApp();
    await startApp('playground');
    await writeWorkspaceFile(workspaceRoot, 'runner-script.ts', buildRunnerScriptSource());

    const response = await fetch(`http://127.0.0.1:${appPort}/script`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filePath: 'runner-script.ts',
        runnerId: 'bun'
      })
    });

    const data = (await response.json()) as { flowId: string; runId: string };
    expect(response.status).toBe(200);
    expect(data.flowId).toBeDefined();
    expect(data.runId).toBeDefined();

    const finished = await waitForFlowEvent(
      getAppResult().eventManager,
      data.flowId,
      'scriptFinished'
    );
    expect(finished.payload.exitCode).toBe(0);
  });

  test('POST /test falls back to the server default profile when request.profile is omitted', async () => {
    await stopApp();
    await startApp('playground');
    await writeWorkspaceFile(workspaceRoot, 'runner.test.ts', buildRunnerTestSource());

    const response = await fetch(`http://127.0.0.1:${appPort}/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filePath: 'runner.test.ts',
        frameworkId: 'bun'
      })
    });

    const data = (await response.json()) as { flowId: string; runId: string };
    expect(response.status).toBe(200);
    expect(data.flowId).toBeDefined();
    expect(data.runId).toBeDefined();

    const finished = await waitForFlowEvent(
      getAppResult().eventManager,
      data.flowId,
      'testFinished'
    );
    expect(finished.payload.exitCode).toBe(0);
    expect(finished.payload.status).toBe('passed');
  });
});
