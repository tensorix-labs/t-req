import * as path from 'node:path';
import { type CombinedEvent, createEngine } from '@t-req/core';
import { buildEngineOptions } from '@t-req/core/config';
import { createFetchTransport, createNodeIO } from '@t-req/core/runtime';
import { resolveLocalConfig } from '../config/loader';
import { extractHeaders, readResponseBody } from './response-utils';
import type { ExecutionResult, ExecutionRunner, ResponseHeader, RunContext } from './types';

function getContentType(headers: ResponseHeader[]): string | undefined {
  return headers.find((header) => header.name.toLowerCase() === 'content-type')?.value;
}

export function createLocalRunner(): ExecutionRunner {
  return {
    async run(context: RunContext): Promise<ExecutionResult> {
      const pluginHooks: ExecutionResult['pluginHooks'] = [];
      const pluginReports: ExecutionResult['pluginReports'] = [];
      const warnings: string[] = [];
      let ttfb: number | undefined;

      const resolved = await resolveLocalConfig(
        context.documentUri,
        context.profile,
        context.output
      );
      warnings.push(...resolved.meta.warnings);
      if (resolved.meta.format === 'ts') {
        warnings.push('treq.config.ts is not supported in VS Code extension mode. Use treq.jsonc.');
      }

      const onEvent = (event: CombinedEvent): void => {
        if (event.type === 'fetchFinished' && typeof event.ttfb === 'number') {
          ttfb = event.ttfb;
          return;
        }

        if (event.type === 'pluginHookFinished') {
          pluginHooks.push({
            pluginName: event.name,
            hook: event.hook,
            durationMs: event.durationMs,
            modified: event.modified
          });
          return;
        }

        if (event.type === 'pluginReport') {
          const report = event.report;
          pluginReports.push({
            pluginName: report.pluginName,
            runId: report.runId,
            flowId: report.flowId,
            reqExecId: report.reqExecId,
            requestName: report.requestName,
            ts: report.ts,
            seq: report.seq,
            data: report.data
          });
        }
      };

      const { engineOptions, requestDefaults } = buildEngineOptions({
        config: resolved.config,
        onEvent
      });

      engineOptions.transport = createFetchTransport();
      engineOptions.io = createNodeIO();

      // Match core precedence: file vars < profile/config vars.
      const variables = {
        ...context.fileVariables,
        ...resolved.config.variables
      };

      const engine = createEngine(engineOptions);
      const startTime = Date.now();

      try {
        const response = await engine.runString(context.request.raw, {
          basePath: path.dirname(context.documentUri.fsPath),
          variables,
          timeoutMs: context.timeoutMs ?? requestDefaults.timeoutMs,
          followRedirects: requestDefaults.followRedirects,
          validateSSL: requestDefaults.validateSSL,
          proxy: requestDefaults.proxy,
          signal: context.signal
        });

        const endTime = Date.now();
        const headers = extractHeaders(response);
        const bodyData = await readResponseBody(response, context.maxBodyBytes);

        return {
          mode: 'local',
          request: {
            index: context.request.index,
            name: context.request.name,
            method: context.request.method,
            url: context.request.url
          },
          response: {
            status: response.status,
            statusText: response.statusText,
            headers,
            body: bodyData.body,
            encoding: bodyData.encoding,
            contentType: getContentType(headers),
            bodyBytes: bodyData.bodyBytes,
            truncated: bodyData.truncated
          },
          timing: {
            startTime,
            endTime,
            durationMs: endTime - startTime,
            ttfb
          },
          pluginHooks,
          pluginReports,
          warnings
        };
      } finally {
        try {
          await resolved.config.pluginManager?.teardown();
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          context.output.appendLine(`[local-runner] plugin teardown warning: ${message}`);
        }
      }
    }
  };
}
