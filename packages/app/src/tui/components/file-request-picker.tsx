import { useKeyboard } from '@opentui/solid';
import fuzzysort from 'fuzzysort';
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, type JSX } from 'solid-js';
import { useDialog, useStore } from '../context';
import { rgba, theme } from '../theme';
import { normalizeKey } from '../util/normalize-key';
import { isRunnableScript, isHttpFile, isTestFile } from '../store';

type PickerItemType = 'test' | 'script' | 'http';

interface PickerItem {
  id: string;
  type: PickerItemType;
  filePath: string;
  fileName: string;
  searchText: string;
}

export type FileRequestPickerProps = {
  onSelect?: (filePath: string) => void;
  onExecute?: (filePath: string) => void;
};

const CONFIRM_TIMEOUT_MS = 2000;

export function FileRequestPicker(props: FileRequestPickerProps): JSX.Element {
  const store = useStore();
  const dialog = useDialog();

  const [query, setQuery] = createSignal('');
  const [selectedIndex, setSelectedIndex] = createSignal(0);
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
          searchText: path
        });
      } else if (isRunnableScript(path)) {
        scripts.push({
          id: `script:${path}`,
          type: 'script',
          filePath: path,
          fileName,
          searchText: path
        });
      } else if (isHttpFile(path)) {
        httpFiles.push({
          id: `http:${path}`,
          type: 'http',
          filePath: path,
          fileName,
          searchText: path
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

  // Clamp selected index when options change
  const clampedIndex = createMemo(() => {
    const items = filteredItems();
    const idx = selectedIndex();
    if (items.length === 0) return 0;
    return Math.min(idx, items.length - 1);
  });

  // Clear pending send when query changes or selection changes
  createEffect(() => {
    query();
    selectedIndex();
    clearPendingSend();
  });

  function clearPendingSend() {
    if (confirmTimeout) {
      clearTimeout(confirmTimeout);
      confirmTimeout = undefined;
    }
    setPendingSendId(undefined);
  }

  function handleSelect(item: PickerItem) {
    props.onSelect?.(item.filePath);
    dialog.clear();
  }

  function handleSend(item: PickerItem) {
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

  // Handle keyboard navigation
  useKeyboard((evt) => {
    const key = normalizeKey(evt);
    const items = filteredItems();
    const currentIdx = clampedIndex();

    // ctrl+enter for send
    if (key.ctrl && key.name === 'return') {
      evt.preventDefault();
      evt.stopPropagation();
      const selected = items[currentIdx];
      if (selected) {
        handleSend(selected);
      }
      return;
    }

    switch (key.name) {
      case 'up':
        evt.preventDefault();
        evt.stopPropagation();
        setSelectedIndex(Math.max(0, currentIdx - 1));
        break;
      case 'down':
        evt.preventDefault();
        evt.stopPropagation();
        setSelectedIndex(Math.min(items.length - 1, currentIdx + 1));
        break;
      case 'return':
        evt.preventDefault();
        evt.stopPropagation();
        const selected = items[currentIdx];
        if (selected) {
          handleSelect(selected);
        }
        break;
      default:
        // j/k navigation
        if (key.name === 'j') {
          evt.preventDefault();
          evt.stopPropagation();
          setSelectedIndex(Math.min(items.length - 1, currentIdx + 1));
        } else if (key.name === 'k') {
          evt.preventDefault();
          evt.stopPropagation();
          setSelectedIndex(Math.max(0, currentIdx - 1));
        }
        // ctrl+p = up, ctrl+n = down
        else if (key.ctrl && key.name === 'p') {
          evt.preventDefault();
          evt.stopPropagation();
          setSelectedIndex(Math.max(0, currentIdx - 1));
        } else if (key.ctrl && key.name === 'n') {
          evt.preventDefault();
          evt.stopPropagation();
          setSelectedIndex(Math.min(items.length - 1, currentIdx + 1));
        }
    }
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

  return (
    <box flexDirection="column">
      {/* Title bar with escape hint */}
      <box
        height={1}
        paddingLeft={1}
        paddingRight={1}
        flexDirection="row"
        justifyContent="space-between"
      >
        <text fg={rgba(theme.text)}>Go to File</text>
        <text fg={rgba(theme.textMuted)}>esc</text>
      </box>

      {/* Search input */}
      <box paddingLeft={1} paddingRight={1} paddingBottom={1}>
        <input
          ref={(el) => (inputRef = el)}
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

            return (
              <box
                height={1}
                paddingLeft={1}
                paddingRight={1}
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
                <text
                  fg={rgba(
                    isPendingSend()
                      ? theme.background
                      : isSelected()
                        ? theme.primary
                        : theme.text
                  )}
                >
                  {isPendingSend()
                    ? 'Press ctrl+enter to confirm'
                    : item.type === 'test'
                      ? `✓ ${item.filePath}`
                      : item.type === 'script'
                        ? `▷ ${item.filePath}`
                        : item.filePath}
                </text>
              </box>
            );
          }}
        </For>
        {filteredItems().length === 0 && (
          <box height={1} paddingLeft={1}>
            <text fg={rgba(theme.textMuted)}>No matches</text>
          </box>
        )}
      </box>

      {/* Action bar */}
      <box height={1} paddingLeft={1} paddingTop={1}>
        <text fg={rgba(theme.textMuted)}>send ctrl+enter</text>
      </box>
    </box>
  );
}
