import type * as vscode from 'vscode';

export type DocumentRequest = {
  index: number;
  name?: string;
  method: string;
  url: string;
  startLine: number;
  methodLine: number;
  endLine: number;
  raw: string;
  protocol?: string;
};

export type RequestRef = {
  index: number;
  name?: string;
  method: string;
  url: string;
};

export type ResponseHeader = {
  name: string;
  value: string;
};

export type ExecutionResult = {
  mode: 'local' | 'server';
  runId?: string;
  flowId?: string;
  reqExecId?: string;
  request: RequestRef;
  response: {
    status: number;
    statusText: string;
    headers: ResponseHeader[];
    body?: string;
    encoding?: 'utf-8' | 'base64';
    contentType?: string;
    bodyBytes: number;
    truncated: boolean;
  };
  timing: {
    startTime: number;
    endTime: number;
    durationMs: number;
    ttfb?: number;
  };
  pluginHooks: Array<{
    pluginName: string;
    hook: string;
    durationMs: number;
    modified: boolean;
  }>;
  pluginReports: Array<{
    pluginName: string;
    runId: string;
    flowId?: string;
    reqExecId?: string;
    requestName?: string;
    ts: number;
    seq: number;
    data: unknown;
  }>;
  warnings: string[];
};

export type RunContext = {
  documentUri: vscode.Uri;
  workspaceFolderPath?: string;
  documentText: string;
  request: DocumentRequest;
  fileVariables: Record<string, string>;
  profile?: string;
  timeoutMs: number;
  maxBodyBytes: number;
  signal: AbortSignal;
  output: vscode.OutputChannel;
};

export type ExecutionRunner = {
  run(context: RunContext): Promise<ExecutionResult>;
};
