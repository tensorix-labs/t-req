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
  /** Handler for Tab key (panel toggle) */
  onTabPress?: () => void;
  /** Handler for Ctrl+H (hide/show panel) */
  onToggleHide?: () => void;
  /** Handler for Enter key */
  onEnter?: () => void;
}

/**
 * Sets up keyboard handling with a declarative command registry.
 * Handles:
 * 1. Keybind-mapped commands (file_picker, quit, etc.)
 * 2. Cancel action when script is running
 * 3. Navigation keys (j/k/up/down)
 */
export function useKeyboardCommands(options: KeyboardCommandsOptions): void {
  const dialog = useDialog();
  const keybind = useKeybind();
  const observer = useObserver();

  const { commands, onCancel, onNavigateDown, onNavigateUp, onTabPress, onToggleHide, onEnter } =
    options;

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

    // 2. Handle cancel (Escape/Ctrl+C when script running)
    if (key.name === 'escape' || (key.ctrl && key.name === 'c')) {
      if (observer.state.runningScript && onCancel) {
        event.preventDefault();
        event.stopPropagation();
        onCancel();
        return;
      }
    }

    // 3. Handle navigation
    switch (key.name) {
      case 'j':
      case 'down':
        event.preventDefault();
        event.stopPropagation();
        onNavigateDown?.();
        return;
      case 'k':
      case 'up':
        event.preventDefault();
        event.stopPropagation();
        onNavigateUp?.();
        return;
    }

    // 4. Handle Tab for panel toggle
    if (key.name === 'tab') {
      event.preventDefault();
      event.stopPropagation();
      onTabPress?.();
      return;
    }

    // 5. Handle Ctrl+H for hide/show panel
    if (key.ctrl && key.name === 'h') {
      event.preventDefault();
      event.stopPropagation();
      onToggleHide?.();
      return;
    }

    // 6. Handle Enter key
    if (key.name === 'return') {
      event.preventDefault();
      event.stopPropagation();
      onEnter?.();
      return;
    }
  });
}
