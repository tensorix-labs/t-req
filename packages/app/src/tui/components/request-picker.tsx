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
import { useDialog } from '../context';
import { usePickerNavigation } from '../hooks';
import { getMethodColor, rgba, theme } from '../theme';

interface RequestItem {
  id: string;
  index: number;
  method: string;
  url: string;
  name?: string;
  protocol?: string;
  searchText: string;
}

export type RequestPickerProps = {
  filePath: string;
  fileName: string;
  requests: WorkspaceRequest[];
  onExecute?: (filePath: string, requestIndex: number, request: WorkspaceRequest) => void;
  onExecuteAll?: (filePath: string) => void;
};

const CONFIRM_TIMEOUT_MS = 2000;

export function RequestPicker(props: RequestPickerProps): JSX.Element {
  const dialog = useDialog();

  const [query, setQuery] = createSignal('');
  const [pendingSendId, setPendingSendId] = createSignal<string | undefined>(undefined);
  let inputRef: { focus: () => void } | undefined;
  let confirmTimeout: ReturnType<typeof setTimeout> | undefined;

  const requestItems = createMemo((): RequestItem[] => {
    return props.requests.map((req) => ({
      id: `${props.filePath}:${req.index}`,
      index: req.index,
      method: req.method,
      url: req.url,
      name: req.name,
      protocol: req.protocol,
      searchText: `${req.method} ${req.url} ${req.name ?? ''}`
    }));
  });

  const filteredItems = createMemo(() => {
    const q = query();
    const items = requestItems();
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

  function handleSend(item: RequestItem) {
    const pending = pendingSendId();

    if (pending === item.id) {
      // Second press - execute
      clearPendingSend();
      const request = props.requests.find((r) => r.index === item.index);
      if (request) {
        props.onExecute?.(props.filePath, item.index, request);
      }
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

  const { clampedIndex, setSelectedIndex } = usePickerNavigation<RequestItem>({
    items: filteredItems,
    onSelect: handleSend,
    additionalKeys: (key, _item, _evt) => {
      if (key.ctrl && key.name === 'a') {
        props.onExecuteAll?.(props.filePath);
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

  onMount(() => {
    setTimeout(() => inputRef?.focus(), 1);
  });

  onCleanup(() => {
    if (confirmTimeout) {
      clearTimeout(confirmTimeout);
    }
  });

  return (
    <box flexDirection="column" gap={1} paddingBottom={1}>
      {/* Title bar */}
      <box
        height={1}
        paddingLeft={2}
        paddingRight={2}
        flexDirection="row"
        justifyContent="space-between"
      >
        <text fg={rgba(theme.text)} attributes={1}>
          {props.fileName}
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
          placeholder="Search requests..."
          placeholderColor={rgba(theme.textMuted)}
          textColor={rgba(theme.text)}
          onInput={(value: string) => {
            setQuery(value);
            setSelectedIndex(0);
          }}
        />
      </box>

      {/* Request list */}
      <box flexDirection="column" maxHeight={10}>
        <For each={filteredItems()}>
          {(item, idx) => {
            const isSelected = () => idx() === clampedIndex();
            const isPendingSend = () => pendingSendId() === item.id;

            return (
              <box
                height={1}
                paddingLeft={2}
                paddingRight={2}
                flexDirection="row"
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
                    <text fg={rgba(getMethodColor(item.method))}>{item.method.padEnd(7)}</text>
                    <text fg={rgba(isSelected() ? theme.primary : theme.text)}>
                      {item.name ?? item.url}
                    </text>
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
        <box flexDirection="row">
          <text fg={rgba(theme.text)} attributes={1}>
            back{' '}
          </text>
          <text fg={rgba(theme.textMuted)}>esc</text>
        </box>
      </box>
    </box>
  );
}
