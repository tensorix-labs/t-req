import { type Component, createEffect, on } from 'solid-js';
import { useObserver, useScriptRunner, useTestRunner, useWorkspace } from '../../context';
import { useEditorPanelState } from '../../hooks/useEditorPanelState';
import type { FileType } from '../../utils/fileType';
import { ScriptPanel } from '../script';
import { CodeEditor } from './CodeEditor';
import { ResizableSplitPane } from './ResizableSplitPane';

interface ScriptEditorWithExecutionProps {
  path: string;
  fileType: FileType;
}

export const ScriptEditorWithExecution: Component<ScriptEditorWithExecutionProps> = (props) => {
  const workspace = useWorkspace();
  const observer = useObserver();
  const scriptRunner = useScriptRunner();
  const testRunner = useTestRunner();
  const panelState = useEditorPanelState();

  // Reset execution state on path changes
  createEffect(
    on(
      () => props.path,
      (path) => {
        observer.clearExecutions();
        observer.clearScriptOutput();

        if (!path) {
          return;
        }
      }
    )
  );

  const isScriptRunning = () => {
    if (props.fileType === 'test') return testRunner.isRunning();
    return scriptRunner.isRunning();
  };

  const handleScriptExecute = async () => {
    if (workspace.hasUnsavedChanges(props.path)) {
      await workspace.saveFile(props.path);
    }

    if (props.fileType === 'test') {
      await testRunner.runTest(props.path);
    } else {
      await scriptRunner.runScript(props.path);
    }

    // Auto-expand results panel on execution
    if (panelState.collapsed()) {
      panelState.setCollapsed(false);
    }
  };

  const handleCancelScript = () => {
    if (props.fileType === 'test') {
      testRunner.cancelTest();
    } else {
      scriptRunner.cancelScript();
    }
  };

  return (
    <div class="flex-1 min-h-0">
      <ResizableSplitPane
        left={<CodeEditor path={props.path} onExecute={handleScriptExecute} />}
        right={
          <div class="h-full bg-treq-bg dark:bg-treq-dark-bg overflow-hidden p-4">
            <ScriptPanel
              scriptPath={props.path}
              isRunning={isScriptRunning()}
              onRun={handleScriptExecute}
              onCancel={handleCancelScript}
            />
          </div>
        }
        collapsed={panelState.collapsed()}
        onCollapseChange={panelState.setCollapsed}
      />
    </div>
  );
};

export default ScriptEditorWithExecution;
