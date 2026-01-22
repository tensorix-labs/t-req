import type { CliRenderer } from '@opentui/core';
import { useKeyboard, useRenderer } from '@opentui/solid';
import { resolve } from 'path';
import { createEffect, createMemo, createSignal, on, onCleanup, Show } from 'solid-js';
import { theme, rgba } from './theme';
import { CommandDialog } from './components/command-dialog';
import { DebugConsoleDialog } from './components/debug-console-dialog';
import { ExecutionList } from './components/execution-list';
import { FileRequestPicker } from './components/file-request-picker';
import { ExecutionDetailView } from './components/execution-detail';
import { RunnerSelectDialog } from './components/runner-select';
import { ScriptOutput } from './components/script-output';
import { useDialog, useExit, useKeybind, useObserver, useSDK, useStore } from './context';
import { normalizeKey } from './util/normalize-key';
import { getStatusDisplay } from './util/status-display';
import { isRunnableScript, isHttpFile } from './store';
import {
  detectRunner,
  runScript,
  loadPersistedRunner,
  savePersistedRunner,
  type RunnerConfig,
  type RunningScript
} from './runner';
import type { EventEnvelope, ExecutionDetail } from './sdk';
import type { ExecutionStatus } from './observer-store';
import { openInEditor } from './editor';

export function App() {
  const sdk = useSDK();
  const store = useStore();
  const observer = useObserver();
  const exit = useExit();
  const dialog = useDialog();
  const keybind = useKeybind();
  const renderer = useRenderer();

  // Running script reference (for killing)
  let runningScriptRef: RunningScript | undefined;

  // SSE unsubscribe function
  let sseUnsubscribe: (() => void) | undefined;

  // Loading execution detail
  const [loadingDetail, setLoadingDetail] = createSignal(false);
  const [executionDetail, setExecutionDetail] = createSignal<ExecutionDetail | undefined>(undefined);

  // Keyboard handling
  useKeyboard((event) => {
    if (dialog.stack.length > 0) return;

    if (keybind.match('debug_console', event)) {
      event.preventDefault();
      event.stopPropagation();
      dialog.replace(() => <DebugConsoleDialog />);
      return;
    }

    if (keybind.match('command_list', event)) {
      event.preventDefault();
      event.stopPropagation();
      dialog.replace(() => <CommandDialog />);
      return;
    }

    if (keybind.match('file_picker', event)) {
      event.preventDefault();
      event.stopPropagation();
      dialog.replace(() => (
        <FileRequestPicker
          onSelect={handleFileSelect}
          onExecute={handleFileExecute}
        />
      ));
      return;
    }

    if (keybind.match('quit', event)) {
      event.preventDefault();
      event.stopPropagation();
      void cleanupAndExit();
      return;
    }

    if (keybind.match('open_in_editor', event)) {
      event.preventDefault();
      event.stopPropagation();
      const detail = executionDetail();
      if (detail) {
        void openInEditor(detail, renderer as CliRenderer);
      }
      return;
    }

    const key = normalizeKey(event);

    // Handle escape to cancel running script
    if (key.name === 'escape' || (key.ctrl && key.name === 'c')) {
      if (observer.runningScript()) {
        event.preventDefault();
        event.stopPropagation();
        cancelRunningScript();
        return;
      }
    }

    switch (key.name) {
      case 'j':
      case 'down':
        event.preventDefault();
        event.stopPropagation();
        observer.selectNextExecution();
        break;
      case 'k':
      case 'up':
        event.preventDefault();
        event.stopPropagation();
        observer.selectPreviousExecution();
        break;
    }
  });

  // Cleanup running script on exit
  async function cleanupAndExit() {
    if (runningScriptRef) {
      runningScriptRef.kill();
      runningScriptRef = undefined;
    }
    if (sseUnsubscribe) {
      sseUnsubscribe();
      sseUnsubscribe = undefined;
    }
    // Best-effort finish flow
    const flowId = observer.flowId();
    if (flowId) {
      try {
        await sdk.finishFlow(flowId);
      } catch {
        // Ignore errors
      }
    }
    void exit();
  }

  // Cancel running script
  function cancelRunningScript() {
    if (runningScriptRef) {
      runningScriptRef.kill();
      runningScriptRef = undefined;
    }
  }

  // Handle file selection from picker (navigate to file in main view)
  function handleFileSelect(filePath: string) {
    // Find the index of the file in the flattened visible list
    const flat = store.flattenedVisible();
    const index = flat.findIndex((n) => n.node.path === filePath);

    if (index >= 0) {
      store.setSelectedIndex(index);
    } else {
      // File might be in a collapsed directory - expand parent directories
      const parts = filePath.split('/');
      let currentPath = '';
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!part) continue;
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        store.expandDir(currentPath);
      }
      // Try again after expanding
      const newFlat = store.flattenedVisible();
      const newIndex = newFlat.findIndex((n) => n.node.path === filePath);
      if (newIndex >= 0) {
        store.setSelectedIndex(newIndex);
      }
    }
  }

  // Handle file execution from picker (run script or first request in HTTP file)
  function handleFileExecute(filePath: string) {
    if (isRunnableScript(filePath)) {
      void handleRunScript(filePath);
    } else if (isHttpFile(filePath)) {
      // For HTTP files, load requests and execute the first one
      void handleExecuteHttpFile(filePath);
    }
  }

  // Execute first request in an HTTP file
  async function handleExecuteHttpFile(filePath: string) {
    // Load requests if not already loaded
    let requests = store.requestsByPath()[filePath];
    if (!requests) {
      try {
        const response = await sdk.listWorkspaceRequests(filePath);
        store.setRequestsForPath(filePath, response.requests);
        requests = response.requests;
      } catch (_e) {
        // Failed to load requests
        return;
      }
    }

    // Execute first request if available
    const firstRequest = requests?.[0];
    if (firstRequest) {
      void handleExecuteRequest(filePath, firstRequest.index);
    }
  }

  // Execute a specific request by file path and request index
  async function handleExecuteRequest(filePath: string, requestIndex: number) {
    // Don't allow running while a script is running
    if (observer.runningScript()) {
      return;
    }

    // Reset observer state for new run
    observer.reset();

    try {
      const { flowId } = await sdk.createFlow(`Running request ${requestIndex} from ${filePath}`);
      observer.setFlowId(flowId);

      // Subscribe to SSE events
      observer.setSseStatus('connecting');
      sseUnsubscribe = sdk.subscribeEvents(
        flowId,
        handleSSEEvent,
        (error) => {
          observer.setSseStatus('error');
          console.error('SSE error:', error);
        },
        () => {
          observer.setSseStatus('closed');
        }
      );
      observer.setSseStatus('open');

      // Execute the request via SDK
      await sdk.executeRequest(flowId, filePath, requestIndex);

      // Best-effort finish flow after request completes
      await sdk.finishFlow(flowId);
    } catch (err) {
      console.error('Failed to execute request:', err);
      observer.setSseStatus('error');
    } finally {
      if (sseUnsubscribe) {
        sseUnsubscribe();
        sseUnsubscribe = undefined;
      }
      observer.setSseStatus('closed');
    }
  }

  // Handle running a script
  async function handleRunScript(scriptPath: string) {
    // Don't allow running another script while one is running
    if (observer.runningScript()) {
      return;
    }

    // Reset observer state for new run
    observer.reset();

    // Resolve absolute path
    const absolutePath = resolve(store.workspaceRoot(), scriptPath);

    // Detect runner or prompt for selection
    let runner = await detectRunner(absolutePath);

    if (!runner) {
      // Try loading persisted runner config
      const persisted = await loadPersistedRunner(store.workspaceRoot());
      if (persisted) {
        runner = persisted.runner;
      } else {
        // Show runner selection dialog
        dialog.replace(() => (
          <RunnerSelectDialog
            scriptPath={scriptPath}
            onSelect={(selectedRunner) => {
              // Save and run with selected runner
              void savePersistedRunner(store.workspaceRoot(), selectedRunner);
              void startScript(absolutePath, scriptPath, selectedRunner);
            }}
          />
        ));
        return;
      }
    }

    await startScript(absolutePath, scriptPath, runner);
  }

  // Start script execution
  async function startScript(absolutePath: string, displayPath: string, runner: RunnerConfig) {
    // Create flow for this script run
    try {
      const { flowId } = await sdk.createFlow(`Running ${displayPath}`);
      observer.setFlowId(flowId);

      // Subscribe to SSE events
      observer.setSseStatus('connecting');
      sseUnsubscribe = sdk.subscribeEvents(
        flowId,
        handleSSEEvent,
        (error) => {
          observer.setSseStatus('error');
          console.error('SSE error:', error);
        },
        () => {
          observer.setSseStatus('closed');
        }
      );
      observer.setSseStatus('open');

      // Build environment variables for the script
      const env: Record<string, string> = {
        TREQ_SERVER: sdk.serverUrl,
        TREQ_FLOW_ID: flowId
      };
      if (sdk.token) {
        env['TREQ_TOKEN'] = sdk.token;
      }

      // Spawn the script
      runningScriptRef = runScript({
        scriptPath: absolutePath,
        runner,
        env,
        cwd: store.workspaceRoot(),
        onStdout: (data) => {
          observer.appendStdout(data);
        },
        onStderr: (data) => {
          observer.appendStderr(data);
        },
        onExit: (code) => {
          observer.setExitCode(code);
          observer.setRunningScript(undefined);
          runningScriptRef = undefined;

          // Best-effort finish flow
          void (async () => {
            try {
              await sdk.finishFlow(flowId);
            } catch {
              // Ignore
            }
          })();

          // Cleanup SSE subscription
          if (sseUnsubscribe) {
            sseUnsubscribe();
            sseUnsubscribe = undefined;
          }
          observer.setSseStatus('closed');
        }
      });

      observer.setRunningScript({
        path: displayPath,
        pid: runningScriptRef.pid,
        startedAt: Date.now()
      });
    } catch (err) {
      console.error('Failed to start script:', err);
      observer.setSseStatus('error');
    }
  }

  // Handle SSE events
  function handleSSEEvent(event: EventEnvelope) {
    const seq = event.seq;
    const lastSeq = observer.lastFlowSeq();

    // Flow-global idempotency: skip if we've already processed this or later
    if (seq <= lastSeq) return;
    observer.setLastFlowSeq(seq);

    switch (event.type) {
      case 'requestQueued': {
        // Create execution with pending status
        const payload = event.payload as { reqLabel?: string; source?: unknown };
        observer.addExecution({
          reqExecId: event.reqExecId!,
          flowId: event.flowId!,
          sessionId: event.sessionId,
          reqLabel: payload.reqLabel,
          status: 'pending',
          timing: { startTime: event.ts }
        });
        break;
      }
      case 'fetchStarted': {
        // Update execution to running status
        const payload = event.payload as { method?: string; url?: string };
        observer.updateExecution(event.reqExecId!, {
          status: 'running',
          method: payload.method,
          urlResolved: payload.url
        });
        break;
      }
      case 'fetchFinished': {
        // Update execution to success
        const payload = event.payload as { status?: number };
        const endTime = event.ts;
        const exec = observer.executionsById()[event.reqExecId!];
        observer.updateExecution(event.reqExecId!, {
          status: 'success',
          statusCode: payload.status,
          timing: {
            ...exec?.timing,
            startTime: exec?.timing.startTime ?? endTime,
            endTime,
            durationMs: exec ? endTime - exec.timing.startTime : 0
          }
        });
        break;
      }
      case 'executionFailed': {
        // Update execution to failed
        const payload = event.payload as { stage?: string; message?: string };
        const endTime = event.ts;
        const exec = observer.executionsById()[event.reqExecId!];
        observer.updateExecution(event.reqExecId!, {
          status: 'failed' as ExecutionStatus,
          error: {
            stage: payload.stage ?? 'unknown',
            message: payload.message ?? 'Unknown error'
          },
          timing: {
            ...exec?.timing,
            startTime: exec?.timing.startTime ?? endTime,
            endTime,
            durationMs: exec ? endTime - exec.timing.startTime : 0
          }
        });
        break;
      }
    }
  }

  // Load execution detail when selection changes or execution status changes
  createEffect(
    on(
      // Track both the selected ID and the selected execution's status
      () => {
        const id = observer.selectedReqExecId();
        const exec = id ? observer.executionsById()[id] : undefined;
        return { id, status: exec?.status };
      },
      async ({ id, status: _status }) => {
        if (!id) {
          setExecutionDetail(undefined);
          return;
        }

        const flowId = observer.flowId();
        if (!flowId) return;

        setLoadingDetail(true);
        try {
          const detail = await sdk.getExecution(flowId, id);
          setExecutionDetail(detail);
        } catch (err) {
          console.error('Failed to load execution detail:', err);
          setExecutionDetail(undefined);
        } finally {
          setLoadingDetail(false);
        }
      },
      { defer: false }
    )
  );

  onCleanup(() => {
    if (runningScriptRef) {
      runningScriptRef.kill();
    }
    if (sseUnsubscribe) {
      sseUnsubscribe();
    }
  });

  const statusDisplay = createMemo(() => getStatusDisplay(store.connectionStatus()));
  const isRunning = createMemo(() => !!observer.runningScript());

  return (
    <box
      flexDirection="column"
      width="100%"
      height="100%"
      backgroundColor={rgba(theme.background)}
    >
      <box flexGrow={1} flexDirection="row" overflow="hidden">
        {/* LEFT column: Executions + Output stacked */}
        <box width="50%" flexDirection="column" overflow="hidden">
          <box height="50%" overflow="hidden">
            <ExecutionList
              executions={observer.executionsList()}
              selectedId={observer.selectedReqExecId()}
              onSelect={observer.setSelectedReqExecId}
              isRunning={isRunning()}
            />
          </box>
          <box height={1} flexShrink={0} backgroundColor={rgba(theme.borderSubtle)} />
          <box flexGrow={1} overflow="hidden">
            <ScriptOutput
              stdoutLines={observer.stdoutLines()}
              stderrLines={observer.stderrLines()}
              exitCode={observer.exitCode()}
              isRunning={isRunning()}
              scriptPath={observer.runningScript()?.path}
            />
          </box>
        </box>

        <box width={1} flexShrink={0} backgroundColor={rgba(theme.borderSubtle)} />

        {/* RIGHT column: Details (always visible) */}
        <box flexGrow={1} overflow="hidden">
          <ExecutionDetailView
            execution={executionDetail()}
            isLoading={loadingDetail()}
          />
        </box>
      </box>

      {/* Status bar */}
      <box height={1} flexShrink={0} paddingLeft={2} paddingRight={2} flexDirection="row" justifyContent="space-between">
        <box flexDirection="row" gap={2}>
          <text fg={rgba(theme.text)}>t-req</text>
          <Show when={isRunning()}>
            <text fg={rgba(theme.warning)}>Running</text>
          </Show>
        </box>
        <box flexDirection="row" gap={2}>
          <box flexDirection="row">
            <text fg={rgba(theme.text)}>{keybind.print('file_picker')}</text>
            <text fg={rgba(theme.textMuted)}> tree</text>
          </box>
          <box flexDirection="row">
            <text fg={rgba(theme.text)}>{keybind.print('command_list')}</text>
            <text fg={rgba(theme.textMuted)}> cmds</text>
          </box>
          <box flexDirection="row" gap={1}>
            <text fg={rgba(statusDisplay().color)}>{statusDisplay().icon}</text>
            <text fg={rgba(theme.textMuted)}>{statusDisplay().text}</text>
          </box>
        </box>
      </box>
    </box>
  );
}
