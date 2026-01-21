import { useKeyboard } from '@opentui/solid';
import { createEffect, createMemo, createSignal, on, onCleanup, untrack } from 'solid-js';
import { theme, rgba } from './theme';
import { CommandDialog } from './components/command-dialog';
import { DebugConsoleDialog } from './components/debug-console-dialog';
import { FileTree } from './components/file-tree';
import { RequestList } from './components/request-list';
import { useDialog, useExit, useKeybind, useSDK, useStore } from './context';
import { normalizeKey } from './util/normalize-key';
import { getStatusDisplay } from './util/status-display';

export function App() {
  const sdk = useSDK();
  const store = useStore();
  const exit = useExit();
  const dialog = useDialog();
  const keybind = useKeybind();

  // Track in-flight fetch paths to prevent duplicate requests (reactive for UI)
  const [loadingPaths, setLoadingPaths] = createSignal<Set<string>>(new Set());

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

    if (keybind.match('quit', event)) {
      event.preventDefault();
      event.stopPropagation();
      void exit();
      return;
    }

    const key = normalizeKey(event);
    switch (key.name) {
      case 'j':
      case 'down':
        event.preventDefault();
        event.stopPropagation();
        store.selectNext();
        break;
      case 'k':
      case 'up':
        event.preventDefault();
        event.stopPropagation();
        store.selectPrevious();
        break;
      case 'return': {
        const selected = store.selectedNode();
        if (selected) {
          if (selected.node.isDir) {
            store.toggleDir(selected.node.path);
          } else {
            // Load requests for selected file
            loadRequestsForFile(selected.node.path);
          }
        }
        break;
      }
      case 'h':
      case 'left': {
        const selected = store.selectedNode();
        if (selected?.node.isDir && selected.isExpanded) {
          store.collapseDir(selected.node.path);
        }
        break;
      }
      case 'l':
      case 'right': {
        const selected = store.selectedNode();
        if (selected?.node.isDir && !selected.isExpanded) {
          store.expandDir(selected.node.path);
        }
        break;
      }
    }
  });

  // Load requests when a file is selected
  async function loadRequestsForFile(path: string) {
    // Check if already loaded or currently loading
    if (store.requestsByPath()[path] || loadingPaths().has(path)) {
      return;
    }

    setLoadingPaths((prev) => {
      const next = new Set(prev);
      next.add(path);
      return next;
    });
    try {
      const response = await sdk.listWorkspaceRequests(path);
      store.setRequestsForPath(path, response.requests);
    } catch (_e) {
      // Silently fail - requests panel will show empty
      // Set empty array to prevent retry on re-select
      store.setRequestsForPath(path, []);
    } finally {
      setLoadingPaths((prev) => {
        const next = new Set(prev);
        next.delete(path);
        return next;
      });
    }
  }

  // Auto-load requests when selection changes to a file (debounced)
  // Uses on() to explicitly track only selectedNode, with a 50ms debounce
  // to prevent load during rapid j/k navigation
  let loadTimeout: ReturnType<typeof setTimeout> | undefined;

  createEffect(
    on(
      () => store.selectedNode(),
      (selected) => {
        // Clear any pending load
        if (loadTimeout) {
          clearTimeout(loadTimeout);
          loadTimeout = undefined;
        }

        if (selected && !selected.node.isDir) {
          // Debounce: wait 50ms before loading
          loadTimeout = setTimeout(() => {
            untrack(() => loadRequestsForFile(selected.node.path));
          }, 50);
        }
      }
    )
  );

  onCleanup(() => {
    if (loadTimeout) {
      clearTimeout(loadTimeout);
    }
  });

  // Get the selected file path for the request list
  const selectedFilePath = () => {
    const selected = store.selectedNode();
    return selected && !selected.node.isDir ? selected.node.path : undefined;
  };

  const requestListLoading = createMemo(() => {
    const path = selectedFilePath();
    if (!path) return false;
    return loadingPaths().has(path);
  });

  const statusDisplay = createMemo(() => getStatusDisplay(store.connectionStatus()));

  return (
    <box
      flexDirection="column"
      width="100%"
      height="100%"
      backgroundColor={rgba(theme.background)}
    >
      <box flexGrow={1} flexDirection="row">
        <box width="50%" flexShrink={0} paddingRight={1}>
          <FileTree
            nodes={store.flattenedVisible()}
            selectedIndex={store.selectedIndex()}
            onSelect={store.setSelectedIndex}
            onToggle={store.toggleDir}
          />
        </box>

        <box width={1} flexShrink={0} backgroundColor={rgba(theme.borderSubtle)} />

        <box flexGrow={1} flexShrink={0}>
          <RequestList
            requests={store.selectedFileRequests()}
            selectedFile={selectedFilePath()}
            isLoading={requestListLoading()}
          />
        </box>
      </box>

      <box height={1} paddingLeft={2} paddingRight={2} flexDirection="row" justifyContent="space-between">
        <text fg={rgba(theme.text)}>t-req 🦖</text>
        <box flexDirection="row" gap={2}>
          <box flexDirection="row">
            <text fg={rgba(theme.text)}>{keybind.print('command_list')}</text>
            <text fg={rgba(theme.textMuted)}> commands</text>
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
