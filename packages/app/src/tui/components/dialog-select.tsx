import { useKeyboard } from '@opentui/solid';
import fuzzysort from 'fuzzysort';
import { createMemo, createSignal, For, type JSX, onMount } from 'solid-js';
import type { DialogContextValue } from '../context/dialog';
import { rgba, theme } from '../theme';
import { normalizeKey } from '../util/normalize-key';

export type DialogSelectOption<T> = {
  title: string;
  value: T;
  description?: string;
  keybind?: string;
  disabled?: boolean;
  onSelect?: (dialog: DialogContextValue) => void;
};

export type DialogSelectProps<T> = {
  title: string;
  placeholder?: string;
  options: DialogSelectOption<T>[];
  onSelect?: (opt: DialogSelectOption<T>) => void;
};

export function DialogSelect<T>(props: DialogSelectProps<T>): JSX.Element {
  const [query, setQuery] = createSignal('');
  const [selectedIndex, setSelectedIndex] = createSignal(0);
  let inputRef: { focus: () => void } | undefined;

  const filteredOptions = createMemo(() => {
    const q = query();
    if (!q) return props.options;

    const results = fuzzysort.go(q, props.options, { key: 'title' });
    return results.map((r) => r.obj);
  });

  // Clamp selected index when options change
  const clampedIndex = createMemo(() => {
    const opts = filteredOptions();
    const idx = selectedIndex();
    if (opts.length === 0) return 0;
    return Math.min(idx, opts.length - 1);
  });

  // Handle keyboard navigation
  useKeyboard((evt) => {
    const key = normalizeKey(evt);
    const opts = filteredOptions();
    const currentIdx = clampedIndex();

    switch (key.name) {
      case 'up':
        evt.preventDefault();
        evt.stopPropagation();
        setSelectedIndex(Math.max(0, currentIdx - 1));
        break;
      case 'down':
        evt.preventDefault();
        evt.stopPropagation();
        setSelectedIndex(Math.min(opts.length - 1, currentIdx + 1));
        break;
      case 'return': {
        evt.preventDefault();
        evt.stopPropagation();
        const selected = opts[currentIdx];
        if (selected && !selected.disabled) {
          props.onSelect?.(selected);
        }
        break;
      }
      default:
        // ctrl+p = up, ctrl+n = down
        if (key.ctrl && key.name === 'p') {
          evt.preventDefault();
          evt.stopPropagation();
          setSelectedIndex(Math.max(0, currentIdx - 1));
        } else if (key.ctrl && key.name === 'n') {
          evt.preventDefault();
          evt.stopPropagation();
          setSelectedIndex(Math.min(opts.length - 1, currentIdx + 1));
        }
    }
  });

  // Auto-focus input on mount
  onMount(() => {
    setTimeout(() => inputRef?.focus(), 1);
  });

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
          {props.title}
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
          placeholder={props.placeholder ?? 'Search...'}
          placeholderColor={rgba(theme.textMuted)}
          textColor={rgba(theme.text)}
          onInput={(value: string) => {
            setQuery(value);
            setSelectedIndex(0);
          }}
        />
      </box>

      {/* Options list */}
      <box flexDirection="column" maxHeight={10}>
        <For each={filteredOptions()}>
          {(opt, idx) => {
            const isSelected = () => idx() === clampedIndex();
            return (
              <box
                height={1}
                paddingLeft={2}
                paddingRight={2}
                flexDirection="row"
                justifyContent="space-between"
                backgroundColor={isSelected() ? rgba(theme.backgroundMenu) : undefined}
              >
                <text
                  fg={rgba(
                    opt.disabled ? theme.textMuted : isSelected() ? theme.primary : theme.text
                  )}
                >
                  {opt.title}
                </text>
                {opt.keybind && <text fg={rgba(theme.textMuted)}>{opt.keybind}</text>}
              </box>
            );
          }}
        </For>
        {filteredOptions().length === 0 && (
          <box height={1} paddingLeft={2}>
            <text fg={rgba(theme.textMuted)}>No matches</text>
          </box>
        )}
      </box>
    </box>
  );
}
