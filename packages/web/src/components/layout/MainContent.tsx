import { createMemo, createSignal, createEffect, For, Show } from 'solid-js';
import { useWorkspace, useScriptRunner, useTestRunner, useObserver } from '../../context';
import { ExecutionPanel } from '../execution';
import { ScriptPanel, RunnerSelectDialog, FrameworkSelectDialog } from '../script';
import { RequestBar } from '../request';
import { HistoryIcon, SpinnerIcon } from '../icons';

// File extensions that are considered scripts
const SCRIPT_EXTENSIONS = ['.js', '.ts', '.mjs', '.mts', '.py'];

// Test file patterns (common naming conventions)
const TEST_FILE_PATTERNS = [
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /_test\.[jt]sx?$/,
  /_spec\.[jt]sx?$/,
  /test_.*\.py$/,
  /.*_test\.py$/
];

function isTestFile(path: string): boolean {
  const fileName = path.split('/').pop() ?? path;
  return TEST_FILE_PATTERNS.some((pattern) => pattern.test(fileName));
}

function isScriptFile(path: string): boolean {
  return SCRIPT_EXTENSIONS.some((ext) => path.endsWith(ext));
}

export function MainContent() {
  const store = useWorkspace();
  const observer = useObserver();
  const scriptRunner = useScriptRunner();
  const testRunner = useTestRunner();
  const [selectedRequestIndex, setSelectedRequestIndex] = createSignal(0);

  const selectedFileName = () => {
    const node = store.selectedNode();
    return node?.node.name;
  };

  const selectedPath = () => store.selectedPath();

  const isTest = createMemo(() => {
    const path = selectedPath();
    return path ? isTestFile(path) : false;
  });

  const isScript = createMemo(() => {
    const path = selectedPath();
    if (!path) return false;
    if (isTestFile(path)) return false;
    return isScriptFile(path);
  });

  const requests = () => store.selectedRequests();

  // Reset request selection and clear displayed execution when file changes
  createEffect(() => {
    selectedPath(); // Track path changes
    setSelectedRequestIndex(0);
    observer.selectExecution(undefined); // Clear displayed execution for fresh state
  });

  // Clear displayed execution when switching between request tabs
  createEffect(() => {
    selectedRequestIndex(); // Track request tab changes
    observer.selectExecution(undefined);
  });

  const selectedRequest = createMemo(() => {
    const reqs = requests();
    const idx = selectedRequestIndex();
    if (reqs.length === 0) return undefined;
    // Reset index if out of bounds
    if (idx >= reqs.length) {
      setSelectedRequestIndex(0);
      return reqs[0];
    }
    return reqs[idx];
  });

  const handleExecute = () => {
    const sdk = store.sdk();
    const path = store.selectedPath();
    const request = selectedRequest();
    if (!sdk || !path || !request) return;
    const profile = store.activeProfile();
    observer.execute(sdk, path, request.index, profile);
  };

  const executionCount = () => observer.executionsList().length;

  return (
    <main class="flex-1 flex flex-col overflow-hidden bg-white dark:bg-treq-dark-bg-card">
      {/* File name header */}
      <div class="px-6 py-3 border-b border-treq-border-light dark:border-treq-dark-border-light">
        <h2 class="text-heading-3 text-treq-text-strong m-0 dark:text-treq-dark-text-strong">
          {selectedFileName() || 'Select a file'}
        </h2>
      </div>

      {/* Main content area */}
      <div class="flex-1 flex flex-col overflow-hidden">
        <Show
          when={isTest()}
          fallback={
            <Show
              when={isScript()}
              fallback={
                <Show
                  when={selectedPath()}
                  fallback={
                    <div class="flex-1 flex items-center justify-center text-treq-text-muted dark:text-treq-dark-text-muted">
                      Select a file to view requests
                    </div>
                  }
                >
                  <Show
                    when={!store.loadingRequests()}
                    fallback={
                      <div class="flex-1 flex items-center justify-center gap-3 text-treq-text-muted dark:text-treq-dark-text-muted">
                        <SpinnerIcon />
                        <span>Loading requests...</span>
                      </div>
                    }
                  >
                    <Show
                      when={requests().length > 0}
                      fallback={
                        <div class="flex-1 flex items-center justify-center text-treq-text-muted dark:text-treq-dark-text-muted">
                          No requests in this file
                        </div>
                      }
                    >
                      {/* Request tabs (if multiple requests) */}
                      <Show when={requests().length > 1}>
                        <div class="px-6 pt-4 pb-2">
                          <div class="flex gap-1 overflow-x-auto">
                            <For each={requests()}>
                              {(req, idx) => (
                                <button
                                  type="button"
                                  class={`px-3 py-1.5 text-xs font-medium rounded-treq transition-all duration-150 whitespace-nowrap ${
                                    selectedRequestIndex() === idx()
                                      ? 'bg-treq-accent text-white'
                                      : 'bg-treq-border-light text-treq-text-muted hover:bg-treq-border-light/80 dark:bg-treq-dark-border-light dark:text-treq-dark-text-muted'
                                  }`}
                                  onClick={() => setSelectedRequestIndex(idx())}
                                >
                                  {req.name || `Request ${idx() + 1}`}
                                </button>
                              )}
                            </For>
                          </div>
                        </div>
                      </Show>

                      {/* Request URL bar */}
                      <div class="px-6 py-3">
                        <Show when={selectedRequest()}>
                          <RequestBar
                            request={selectedRequest()!}
                            executing={observer.state.executing}
                            onExecute={handleExecute}
                          />
                        </Show>
                      </div>

                      {/* Response area */}
                      <div class="flex-1 px-6 pb-4 min-h-0 overflow-hidden">
                        <ExecutionPanel />
                      </div>
                    </Show>
                  </Show>
                </Show>
              }
            >
              <div class="flex-1 px-6 py-4 overflow-hidden">
                <ScriptPanel
                  scriptPath={selectedPath()!}
                  isRunning={scriptRunner.isRunning()}
                  onRun={() => scriptRunner.runScript(selectedPath()!)}
                  onCancel={() => scriptRunner.cancelScript()}
                />
              </div>
            </Show>
          }
        >
          <div class="flex-1 px-6 py-4 overflow-hidden">
            <ScriptPanel
              scriptPath={selectedPath()!}
              isRunning={testRunner.isRunning()}
              onRun={() => testRunner.runTest(selectedPath()!)}
              onCancel={() => testRunner.cancelTest()}
            />
          </div>
        </Show>
      </div>

      {/* Footer with history - always visible for stable layout */}
      <div class="px-6 py-2 border-t border-treq-border-light dark:border-treq-dark-border-light bg-white dark:bg-treq-dark-bg">
        <Show
          when={executionCount() > 0}
          fallback={
            <span class="flex items-center gap-2 text-xs text-treq-text-muted/50 dark:text-treq-dark-text-muted/50">
              <HistoryIcon />
              <span>History</span>
            </span>
          }
        >
          <button
            type="button"
            class="flex items-center gap-2 text-xs text-treq-text-muted dark:text-treq-dark-text-muted hover:text-treq-accent transition-colors"
            onClick={() => observer.openHistory()}
          >
            <HistoryIcon />
            <span>History ({executionCount()})</span>
          </button>
        </Show>
      </div>

      <RunnerSelectDialog
        isOpen={scriptRunner.dialogOpen()}
        scriptPath={scriptRunner.dialogScriptPath()}
        options={scriptRunner.dialogOptions()}
        onSelect={scriptRunner.handleRunnerSelect}
        onClose={scriptRunner.handleDialogClose}
      />

      <FrameworkSelectDialog
        isOpen={testRunner.dialogOpen()}
        testPath={testRunner.dialogTestPath()}
        options={testRunner.dialogOptions()}
        onSelect={testRunner.handleFrameworkSelect}
        onClose={testRunner.handleDialogClose}
      />
    </main>
  );
}
