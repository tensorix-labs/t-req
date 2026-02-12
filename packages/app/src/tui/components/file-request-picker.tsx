import type { WorkspaceRequest } from '@t-req/sdk/client';
import fuzzysort from 'fuzzysort';
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  type JSX,
  onCleanup,
  onMount,
  Show
} from 'solid-js';
import { useDialog, useStore } from '../context';
import { usePickerNavigation } from '../hooks';
import { isHttpFile, isRunnableScript, isTestFile } from '../store';
import { rgba, theme } from '../theme';
import { RequestPicker } from './request-picker';

type PickerItemType = 'test' | 'script' | 'http';

interface PickerItem {
  id: string;
  type: PickerItemType;
  filePath: string;
  fileName: string;
  searchText: string;
  requestCount: number;
}

export type FileRequestPickerProps = {
  onExecute?: (filePath: string) => void;
  onExecuteAll?: (filePath: string) => void;
  onExecuteRequest?: (filePath: string, requestIndex: number, request: WorkspaceRequest) => void;
  loadRequests?: (filePath: string) => Promise<WorkspaceRequest[] | undefined>;
};

const CONFIRM_TIMEOUT_MS = 2000;

export function FileRequestPicker(props: FileRequestPickerProps): JSX.Element {
  const store = useStore();
  const dialog = useDialog();

  const [query, setQuery] = createSignal('');
  const [pendingSendId, setPendingSendId] = createSignal<string | undefined>(undefined);
  let inputRef: { focus: () => void } | undefined;
  let confirmTimeout: ReturnType<typeof setTimeout> | undefined;

  // Build flat list of picker items from store files
  const pickerItems = createMemo((): PickerItem[] => {
    const files = store.files();
    const tests: PickerItem[] = [];
    const scripts: PickerItem[] = [];
    const httpFiles: PickerItem[] = [];

    for (const file of files) {
      const path = file.path;
      const fileName = path.includes('/') ? path.substring(path.lastIndexOf('/') + 1) : path;

      if (isTestFile(path)) {
        tests.push({
          id: `test:${path}`,
          type: 'test',
          filePath: path,
          fileName,
          searchText: path,
          requestCount: file.requestCount
        });
      } else if (isRunnableScript(path)) {
        scripts.push({
          id: `script:${path}`,
          type: 'script',
          filePath: path,
          fileName,
          searchText: path,
          requestCount: file.requestCount
        });
      } else if (isHttpFile(path)) {
        httpFiles.push({
          id: `http:${path}`,
          type: 'http',
          filePath: path,
          fileName,
          searchText: path,
          requestCount: file.requestCount
        });
      }
    }

    // Sort alphabetically by file path
    tests.sort((a, b) => a.filePath.localeCompare(b.filePath));
    scripts.sort((a, b) => a.filePath.localeCompare(b.filePath));
    httpFiles.sort((a, b) => a.filePath.localeCompare(b.filePath));

    // Tests first, then scripts, then HTTP files
    return [...tests, ...scripts, ...httpFiles];
  });

  // Filter items by fuzzy search on file path
  const filteredItems = createMemo(() => {
    const q = query();
    const items = pickerItems();
    if (!q) return items;

    const results = fuzzysort.go(q, items, { key: 'searchText' });
    return results.map((r) => r.obj);
  });

  function clearPendingSend() {
    if (confirmTimeout) {
      clearTimeout(confirmTimeout);
      confirmTimeout = undefined;
    }
    setPendingSendId(undefined);
  }

  // Guard against concurrent drill-down loads
  let drillLoading = false;

  async function drillIntoFile(item: PickerItem) {
    if (drillLoading || !props.loadRequests) return;
    drillLoading = true;

    try {
      const requests = await props.loadRequests(item.filePath);
      if (!requests || requests.length <= 1) {
        // Stale count or single request — fall back to direct execution
        props.onExecute?.(item.filePath);
        dialog.clear();
        return;
      }

      dialog.push(() => (
        <RequestPicker
          filePath={item.filePath}
          fileName={item.fileName}
          requests={requests}
          onExecute={props.onExecuteRequest}
          onExecuteAll={props.onExecuteAll}
        />
      ));
    } catch {
      // Load failed — fall back to direct execution
      props.onExecute?.(item.filePath);
      dialog.clear();
    } finally {
      drillLoading = false;
    }
  }

  function handleSend(item: PickerItem) {
    // Multi-request HTTP files drill down immediately (no two-step confirm)
    if (item.type === 'http' && item.requestCount > 1 && props.loadRequests) {
      void drillIntoFile(item);
      return;
    }

    const pending = pendingSendId();

    if (pending === item.id) {
      // Second press - execute
      clearPendingSend();
      props.onExecute?.(item.filePath);
      dialog.clear();
    } else {
      // First press - set pending with timeout
      clearPendingSend();
      setPendingSendId(item.id);
      confirmTimeout = setTimeout(() => {
        setPendingSendId(undefined);
      }, CONFIRM_TIMEOUT_MS);
    }
  }

  const { clampedIndex, setSelectedIndex } = usePickerNavigation<PickerItem>({
    items: filteredItems,
    onSelect: handleSend,
    additionalKeys: (key, item, _evt) => {
      if (key.ctrl && key.name === 'a' && item?.type === 'http') {
        props.onExecuteAll?.(item.filePath);
        dialog.clear();
        return true;
      }
      return false;
    }
  });

  // Clear pending send when query or selection changes
  createEffect(() => {
    query();
    clampedIndex();
    clearPendingSend();
  });

  // Auto-focus input on mount
  onMount(() => {
    setTimeout(() => inputRef?.focus(), 1);
  });

  // Cleanup timeout on unmount
  onCleanup(() => {
    if (confirmTimeout) {
      clearTimeout(confirmTimeout);
    }
  });

  function itemLabel(item: PickerItem): string {
    if (item.type === 'test') return `✓ ${item.filePath}`;
    if (item.type === 'script') return `▷ ${item.filePath}`;
    return item.filePath;
  }

  return (
    <box flexDirection="column" gap={1} paddingBottom={1}>
      {/* Title bar with escape hint */}
      <box
        height={1}
        paddingLeft={2}
        paddingRight={2}
        flexDirection="row"
        justifyContent="space-between"
      >
        <text fg={rgba(theme.text)} attributes={1}>
          Go to File
        </text>
        <text fg={rgba(theme.textMuted)}>esc</text>
      </box>

      {/* Search input */}
      <box paddingLeft={2} paddingRight={2} paddingBottom={1}>
        <input
          ref={(el) => {
            inputRef = el;
          }}
          width="100%"
          placeholder="Search..."
          placeholderColor={rgba(theme.textMuted)}
          textColor={rgba(theme.text)}
          onInput={(value: string) => {
            setQuery(value);
            setSelectedIndex(0);
          }}
        />
      </box>

      {/* Items list */}
      <box flexDirection="column" maxHeight={10}>
        <For each={filteredItems()}>
          {(item, idx) => {
            const isSelected = () => idx() === clampedIndex();
            const isPendingSend = () => pendingSendId() === item.id;
            const showBadge = () =>
              !isPendingSend() && item.type === 'http' && item.requestCount > 1;

            return (
              <box
                height={1}
                paddingLeft={2}
                paddingRight={2}
                flexDirection="row"
                justifyContent="space-between"
                backgroundColor={
                  isPendingSend()
                    ? rgba(theme.success)
                    : isSelected()
                      ? rgba(theme.backgroundMenu)
                      : undefined
                }
              >
                <Show
                  when={!isPendingSend()}
                  fallback={<text fg={rgba(theme.background)}>Press enter to confirm</text>}
                >
                  <box flexDirection="row">
                    <text fg={rgba(isSelected() ? theme.primary : theme.text)}>
                      {itemLabel(item)}
                    </text>
                    <Show when={showBadge()}>
                      <text fg={rgba(theme.textMuted)}>{` [${item.requestCount}]`}</text>
                    </Show>
                  </box>
                </Show>
              </box>
            );
          }}
        </For>
        <Show when={filteredItems().length === 0}>
          <box height={1} paddingLeft={2}>
            <text fg={rgba(theme.textMuted)}>No matches</text>
          </box>
        </Show>
      </box>

      {/* Action bar */}
      <box height={1} paddingLeft={2} flexDirection="row" gap={2}>
        <box flexDirection="row">
          <text fg={rgba(theme.text)} attributes={1}>
            send{' '}
          </text>
          <text fg={rgba(theme.textMuted)}>enter</text>
        </box>
        <box flexDirection="row">
          <text fg={rgba(theme.text)} attributes={1}>
            run all{' '}
          </text>
          <text fg={rgba(theme.textMuted)}>ctrl+a</text>
        </box>
      </box>
    </box>
  );
}
