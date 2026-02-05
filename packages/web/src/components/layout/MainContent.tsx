import { Show } from 'solid-js';
import { useWorkspace } from '../../context/workspace';
import { EditorWithExecution, EditorTabs } from '../editor';

export function MainContent() {
  const store = useWorkspace();

  const activeFile = () => store.activeFile();
  const openFiles = () => store.openFiles();

  return (
    <main class="flex-1 flex flex-col overflow-hidden bg-treq-bg dark:bg-treq-dark-bg">
      {/* Editor tabs */}
      <Show when={openFiles().length > 0}>
        <EditorTabs />
      </Show>

      {/* Main content area */}
      <div class="flex-1 flex overflow-hidden">
        <Show
          when={activeFile()}
          fallback={
            <div class="flex-1 flex flex-col items-center justify-center text-treq-text-muted dark:text-treq-dark-text-muted">
              <div class="flex flex-col items-center space-y-4">
                <div class="text-6xl">
                  <img src="/logo.jpg" alt="t-req" class="block mx-auto h-24" />
                </div>
                <p class="text-lg">Select a file to edit</p>
              </div>
            </div>
          }
        >
          {/* Editor with execution panel */}
          <div class="flex-1 overflow-hidden">
            <EditorWithExecution path={activeFile()!} />
          </div>
        </Show>
      </div>

    </main>
  );
}
