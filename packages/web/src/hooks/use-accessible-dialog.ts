import { onCleanup, onMount } from 'solid-js';
import { findFirstFocusableElement, getKeyboardFocusableElements } from '../utils/focus';

export interface UseAccessibleDialogOptions {
  /** Reference to the dialog container element */
  containerRef: () => HTMLElement | undefined;
  /** Callback when user presses Escape key */
  onEscape: () => void;
  /** Whether to automatically focus the first focusable element on mount (default: true) */
  autoFocus?: boolean;
  /** Whether to restore focus to the previously focused element on cleanup (default: true) */
  restoreFocus?: boolean;
  /** Whether to prevent body scroll while dialog is open (default: true) */
  preventBodyScroll?: boolean;
}

/**
 * Hook to manage accessible dialog/modal behavior
 *
 * Handles:
 * - Focus trapping within the dialog
 * - Escape key handling
 * - Initial focus placement
 * - Focus restoration on close
 * - Body scroll locking
 */
export function useAccessibleDialog(options: UseAccessibleDialogOptions): void {
  const {
    containerRef,
    onEscape,
    autoFocus = true,
    restoreFocus = true,
    preventBodyScroll = true
  } = options;

  let previousActiveElement: Element | null = null;
  let cleanupFunctions: Array<() => void> = [];

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onEscape();
      return;
    }

    if (event.key === 'Tab') {
      const container = containerRef();
      if (!container) return;

      const focusableElements = getKeyboardFocusableElements(container);
      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement as HTMLElement;

      // Handle Tab key to cycle focus
      if (event.shiftKey) {
        // Shift + Tab: move to previous element
        if (activeElement === firstElement || !focusableElements.includes(activeElement)) {
          event.preventDefault();
          lastElement.focus();
        }
      } else {
        // Tab: move to next element
        if (activeElement === lastElement) {
          event.preventDefault();
          firstElement.focus();
        }
      }
    }
  };

  onMount(() => {
    // Store the currently focused element to restore later
    if (restoreFocus) {
      previousActiveElement = document.activeElement;
    }

    // Prevent body scroll
    if (preventBodyScroll) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      cleanupFunctions.push(() => {
        document.body.style.overflow = originalOverflow;
      });
    }

    // Add keyboard event listener
    window.addEventListener('keydown', handleKeyDown);
    cleanupFunctions.push(() => {
      window.removeEventListener('keydown', handleKeyDown);
    });

    // Auto-focus the first focusable element
    if (autoFocus) {
      const container = containerRef();
      if (container) {
        // Use setTimeout to ensure DOM is ready
        setTimeout(() => {
          const firstFocusable = findFirstFocusableElement(container);
          firstFocusable?.focus();
        }, 0);
      }
    }
  });

  onCleanup(() => {
    // Run all cleanup functions
    for (const cleanup of cleanupFunctions) {
      cleanup();
    }
    cleanupFunctions = [];

    // Restore focus to the previously focused element
    if (restoreFocus && previousActiveElement instanceof HTMLElement) {
      previousActiveElement.focus();
    }
  });
}
