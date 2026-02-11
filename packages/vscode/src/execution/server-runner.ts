import * as path from 'node:path';
import { createTreqClient, type TreqClient } from '@t-req/sdk/client';
import type { ExecutionResult, ExecutionRunner, ResponseHeader, RunContext } from './types';

export class ServerAuthError extends Error {
  readonly status: 401 | 403;

  constructor(status: 401 | 403, message: string) {
    super(message);
    this.name = 'ServerAuthError';
    this.status = status;
  }
}

export function isServerAuthError(error: unknown): error is ServerAuthError {
  if (error instanceof ServerAuthError) {
    return true;
  }
  if (!(error instanceof Error)) {
    return false;
  }
  const candidate = error as Error & { status?: number };
  return (
    candidate.name === 'ServerAuthError' && (candidate.status === 401 || candidate.status === 403)
  );
}

function contentTypeFromHeaders(headers: ResponseHeader[]): string | undefined {
  return headers.find((header) => header.name.toLowerCase() === 'content-type')?.value;
}

async function unwrap<T>(
  promise: Promise<{ data?: T; error?: unknown; response: Response }>
): Promise<T> {
  const { data, error, response } = await promise;
  if (error) {
    if (response.status === 401 || response.status === 403) {
      const message =
        (error as { error?: { message?: string } }).error?.message ??
        `Authentication failed (HTTP ${response.status})`;
      throw new ServerAuthError(response.status as 401 | 403, message);
    }
    const message =
      (error as { error?: { message?: string } }).error?.message ?? `HTTP ${response.status}`;
    throw new Error(message);
  }
  if (!data) {
    throw new Error('No data returned from server');
  }
  return data;
}

async function safeFinishFlow(
  client: TreqClient,
  flowId: string,
  output: { appendLine: (line: string) => void }
): Promise<void> {
  try {
    await unwrap(client.postFlowsByFlowIdFinish({ path: { flowId } }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    output.appendLine(`[server-runner] flow finish warning: ${message}`);
  }
}

type ServerRunnerDeps = {
  createClient?: (options: { baseUrl: string; token?: string }) => TreqClient;
};

export function createServerRunner(
  serverUrl: string,
  serverToken: string,
  deps: ServerRunnerDeps = {}
): ExecutionRunner {
  const createClient = deps.createClient ?? createTreqClient;
  const client = createClient({ baseUrl: serverUrl, token: serverToken || undefined });

  return {
    async run(context: RunContext): Promise<ExecutionResult> {
      const warnings: string[] = [];

      if (!context.workspaceFolderPath) {
        throw new Error('Server mode requires the file to be inside an opened workspace folder.');
      }

      const workspaceRelativeDir = path
        .relative(context.workspaceFolderPath, path.dirname(context.documentUri.fsPath))
        .split(path.sep)
        .join('/');
      const basePath = workspaceRelativeDir || '.';

      const flow = await unwrap(
        client.postFlows({
          body: {
            label: `VS Code: ${context.request.method} ${context.request.url}`
          },
          signal: context.signal
        })
      );

      const flowId = flow.flowId;
      const startTime = Date.now();

      try {
        const executeResponse = await unwrap(
          client.postExecute({
            body: {
              content: context.request.raw,
              flowId,
              profile: context.profile,
              requestIndex: 0,
              basePath,
              timeoutMs: context.timeoutMs,
              variables: context.fileVariables
            },
            signal: context.signal
          })
        );

        const endTime = Date.now();
        const initialHeaders = executeResponse.response.headers.map((header) => ({
          name: header.name,
          value: header.value
        }));

        let enrichedHooks: ExecutionResult['pluginHooks'] = [];
        let enrichedReports: ExecutionResult['pluginReports'] = (
          executeResponse.pluginReports ?? []
        ).map((report) => ({
          pluginName: report.pluginName,
          runId: report.runId,
          flowId: report.flowId,
          reqExecId: report.reqExecId,
          requestName: report.requestName,
          ts: report.ts,
          seq: report.seq,
          data: report.data ?? null
        }));
        let ttfb: number | undefined;

        if (executeResponse.flowId && executeResponse.reqExecId) {
          try {
            const detail = await unwrap(
              client.getFlowsByFlowIdExecutionsByReqExecId({
                path: {
                  flowId: executeResponse.flowId,
                  reqExecId: executeResponse.reqExecId
                },
                signal: context.signal
              })
            );

            enrichedHooks = (detail.pluginHooks ?? []).map((hook) => ({
              pluginName: hook.pluginName,
              hook: hook.hook,
              durationMs: hook.durationMs,
              modified: hook.modified
            }));

            enrichedReports = (detail.pluginReports ?? []).map((report) => ({
              pluginName: report.pluginName,
              runId: report.runId,
              flowId: report.flowId,
              reqExecId: report.reqExecId,
              requestName: report.requestName,
              ts: report.ts,
              seq: report.seq,
              data: report.data ?? null
            }));

            ttfb = detail.timing.ttfb;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            warnings.push(`Failed to enrich execution details: ${message}`);
            context.output.appendLine(`[server-runner] enrichment warning: ${message}`);
          }
        }

        return {
          mode: 'server',
          runId: executeResponse.runId,
          flowId: executeResponse.flowId,
          reqExecId: executeResponse.reqExecId,
          request: {
            index: context.request.index,
            name: context.request.name,
            method: context.request.method,
            url: context.request.url
          },
          response: {
            status: executeResponse.response.status,
            statusText: executeResponse.response.statusText,
            headers: initialHeaders,
            body: executeResponse.response.body,
            encoding: executeResponse.response.encoding,
            contentType: contentTypeFromHeaders(initialHeaders),
            bodyBytes: executeResponse.response.bodyBytes,
            truncated: executeResponse.response.truncated
          },
          timing: {
            startTime: executeResponse.timing.startTime ?? startTime,
            endTime: executeResponse.timing.endTime ?? endTime,
            durationMs: executeResponse.timing.durationMs ?? endTime - startTime,
            ttfb
          },
          pluginHooks: enrichedHooks,
          pluginReports: enrichedReports,
          warnings
        };
      } finally {
        await safeFinishFlow(client, flowId, context.output);
      }
    }
  };
}
