import { createMemo, Show } from 'solid-js';
import { useWorkspace, useScriptRunner, useTestRunner } from '../../context';
import { RequestList } from '../request-list';
import { ExecutionPanel } from '../execution';
import { ScriptPanel, RunnerSelectDialog, FrameworkSelectDialog } from '../script';

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
  const scriptRunner = useScriptRunner();
  const testRunner = useTestRunner();

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
    // Test files should not be treated as plain scripts
    if (isTestFile(path)) return false;
    return isScriptFile(path);
  });

  return (
    <main class="flex-1 flex flex-col overflow-hidden bg-treq-bg-card dark:bg-treq-dark-bg-card">
      <div class="px-6 py-3 border-b border-treq-border-light dark:border-treq-dark-border-light">
        <h2 class="text-base font-semibold text-treq-text-strong m-0 dark:text-treq-dark-text-strong">
          {selectedFileName() || 'Requests'}
        </h2>
      </div>
      <div class="flex-1 overflow-hidden px-6 py-4">
        <Show
          when={isTest()}
          fallback={
            <Show
              when={isScript()}
              fallback={
                <div class="flex h-full gap-6">
                  <div class="flex-1 min-w-[300px] max-w-[400px] overflow-y-auto">
                    <RequestList />
                  </div>
                  <div class="flex-[2] min-w-0 overflow-hidden">
                    <ExecutionPanel />
                  </div>
                </div>
              }
            >
              <ScriptPanel
                scriptPath={selectedPath()!}
                isRunning={scriptRunner.isRunning()}
                onRun={() => scriptRunner.runScript(selectedPath()!)}
                onCancel={() => scriptRunner.cancelScript()}
              />
            </Show>
          }
        >
          <ScriptPanel
            scriptPath={selectedPath()!}
            isRunning={testRunner.isRunning()}
            onRun={() => testRunner.runTest(selectedPath()!)}
            onCancel={() => testRunner.cancelTest()}
          />
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
