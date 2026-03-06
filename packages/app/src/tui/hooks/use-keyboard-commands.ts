/**
 * useKeyboardCommands Hook
 *
 * Implements a declarative command-action registry pattern for keyboard handling.
 * Separates keybind-action mapping from imperative if/else chains.
 */

import { useKeyboard } from '@opentui/solid';
import type { KeybindAction } from '../context';
import { useDialog, useKeybind, useObserver } from '../context';
import { normalizeKey } from '../util/normalize-key';

export interface CommandAction {
  action: () => void | Promise<void>;
}

export type CommandRegistry = Partial<Record<KeybindAction, CommandAction>>;

export interface KeyboardCommandsOptions {
  /** Registry of keybind actions */
  commands: CommandRegistry;
  /** Handler for cancel action (Escape/Ctrl+C when script running) */
  onCancel?: () => void;
  /** Handler for navigation down (j/down) */
  onNavigateDown?: () => void;
  /** Handler for navigation up (k/up) */
  onNavigateUp?: () => void;
  /** Handler for Ctrl+H (hide/show panel) */
  onToggleHide?: () => void;
  /** Whether j/k navigation should be active */
  shouldHandleVimNavigation?: () => boolean;
  /** Handler for Tab key cycling */
  onCycleTab?: () => void;
  /** Handler for Enter key on active list item */
  onEnter?: () => boolean | undefined;
  /** Handler for Space key on active list item */
  onSpace?: () => boolean | undefined;
}

/**
 * Sets up keyboard handling with a declarative command registry.
 * Handles:
 * 1. Keybind-mapped commands (file_picker, quit, etc.)
 * 2. Tab cycling for left panel tabs
 * 3. Cancel action when script is running
 * 4. Navigation and active-item actions (j/k/up/down/enter/space)
 */
export function useKeyboardCommands(options: KeyboardCommandsOptions): void {
  const dialog = useDialog();
  const keybind = useKeybind();
  const observer = useObserver();

  const {
    commands,
    onCancel,
    onNavigateDown,
    onNavigateUp,
    onToggleHide,
    shouldHandleVimNavigation,
    onCycleTab,
    onEnter,
    onSpace
  } = options;

  useKeyboard((event) => {
    // Skip when dialog is open
    if (dialog.stack.length > 0) return;

    // 1. Check command registry
    for (const [actionName, command] of Object.entries(commands)) {
      if (keybind.match(actionName as KeybindAction, event)) {
        event.preventDefault();
        event.stopPropagation();
        void command.action();
        return;
      }
    }

    const key = normalizeKey(event);
    const rawName = typeof event.name === 'string' ? event.name : '';

    // 2. Handle Tab switching (Files <-> Executions)
    const isTabKey = key.name === 'tab' || rawName === 'tab' || rawName === '\t';
    if (isTabKey && onCycleTab) {
      event.preventDefault();
      event.stopPropagation();
      onCycleTab();
      return;
    }

    // 3. Handle cancel (Escape/Ctrl+C when script running)
    if (key.name === 'escape' || (key.ctrl && key.name === 'c')) {
      if (observer.state.runningScript && onCancel) {
        event.preventDefault();
        event.stopPropagation();
        onCancel();
        return;
      }
    }

    // 4. Handle navigation
    switch (key.name) {
      case 'down':
        event.preventDefault();
        event.stopPropagation();
        onNavigateDown?.();
        return;
      case 'up':
        event.preventDefault();
        event.stopPropagation();
        onNavigateUp?.();
        return;
    }

    if (shouldHandleVimNavigation?.() ?? true) {
      if (key.name === 'j') {
        event.preventDefault();
        event.stopPropagation();
        onNavigateDown?.();
        return;
      }

      if (key.name === 'k') {
        event.preventDefault();
        event.stopPropagation();
        onNavigateUp?.();
        return;
      }
    }

    // 5. Handle Ctrl+H for hide/show panel
    if (key.ctrl && key.name === 'h') {
      event.preventDefault();
      event.stopPropagation();
      onToggleHide?.();
      return;
    }

    // 6. Handle Enter on active item
    const isEnterKey = key.name === 'enter' || key.name === 'return' || rawName === '\r';
    if (isEnterKey && onEnter) {
      const handled = onEnter();
      if (handled === false) return;
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    // 7. Handle Space on active item
    const isSpaceKey = key.name === 'space' || rawName === ' ';
    if (isSpaceKey && onSpace) {
      const handled = onSpace();
      if (handled === false) return;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
  });
}
