/**
 * usePickerNavigation Hook
 *
 * Shared keyboard navigation for picker dialogs. Handles:
 * - Up/Down, j/k, Ctrl+P/Ctrl+N for selection movement
 * - Enter to select the current item
 * - Delegation to component-specific key handlers
 */

import type { ParsedKey } from '@opentui/core';
import { useKeyboard } from '@opentui/solid';
import { createMemo, createSignal } from 'solid-js';
import { normalizeKey } from '../util/normalize-key';

type NormalizedKey = ReturnType<typeof normalizeKey>;

export interface UsePickerNavigationOptions<T> {
  /** Reactive accessor for the filtered item list */
  items: () => T[];
  /** Called when Enter is pressed on an item */
  onSelect: (item: T) => void;
  /** Optional handler for additional keys. Return true if the key was handled. */
  additionalKeys?: (key: NormalizedKey, item: T | undefined, evt: ParsedKey) => boolean;
}

export interface PickerNavigationReturn {
  selectedIndex: () => number;
  setSelectedIndex: (idx: number) => void;
  clampedIndex: () => number;
}

export function usePickerNavigation<T>(
  opts: UsePickerNavigationOptions<T>
): PickerNavigationReturn {
  const [selectedIndex, setSelectedIndex] = createSignal(0);

  const clampedIndex = createMemo(() => {
    const items = opts.items();
    const idx = selectedIndex();
    if (items.length === 0) return 0;
    return Math.min(idx, items.length - 1);
  });

  useKeyboard((evt) => {
    const key = normalizeKey(evt);
    const items = opts.items();
    const currentIdx = clampedIndex();

    // Up navigation
    if (key.name === 'up' || key.name === 'k' || (key.ctrl && key.name === 'p')) {
      evt.preventDefault();
      evt.stopPropagation();
      setSelectedIndex(Math.max(0, currentIdx - 1));
      return;
    }

    // Down navigation
    if (key.name === 'down' || key.name === 'j' || (key.ctrl && key.name === 'n')) {
      evt.preventDefault();
      evt.stopPropagation();
      setSelectedIndex(Math.min(items.length - 1, currentIdx + 1));
      return;
    }

    // Select
    if (key.name === 'return') {
      evt.preventDefault();
      evt.stopPropagation();
      const selected = items[currentIdx];
      if (selected) opts.onSelect(selected);
      return;
    }

    // Delegate to component-specific handlers
    const selected = items[currentIdx];
    if (opts.additionalKeys?.(key, selected, evt)) {
      evt.preventDefault();
      evt.stopPropagation();
    }
  });

  return { selectedIndex, setSelectedIndex, clampedIndex };
}
