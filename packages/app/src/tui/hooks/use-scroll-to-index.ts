import type { ScrollBoxRenderable } from '@opentui/core';
import { createEffect } from 'solid-js';

export interface UseScrollToIndexOptions {
  scrollRef: () => ScrollBoxRenderable | undefined;
  selectedIndex: () => number;
  itemCount: () => number;
}

/**
 * Keep a selected row index visible in a scrollbox with fixed-height rows.
 */
export function useScrollToIndex(opts: UseScrollToIndexOptions): void {
  createEffect(() => {
    const scrollRef = opts.scrollRef();
    const itemCount = opts.itemCount();
    const index = opts.selectedIndex();

    if (!scrollRef || itemCount === 0 || index < 0) return;

    const viewportHeight = scrollRef.height;
    const scrollTop = scrollRef.scrollTop;
    const scrollBottom = scrollTop + viewportHeight;

    if (index < scrollTop) {
      scrollRef.scrollBy(index - scrollTop);
      return;
    }

    if (index + 1 > scrollBottom) {
      scrollRef.scrollBy(index + 1 - scrollBottom);
    }
  });
}
