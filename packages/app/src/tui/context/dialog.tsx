import { RGBA } from '@opentui/core';
import { useKeyboard, useRenderer, useTerminalDimensions } from '@opentui/solid';
import {
  createContext,
  createSignal,
  Show,
  useContext,
  type Accessor,
  type JSX
} from 'solid-js';
import { createStore } from 'solid-js/store';
import { rgba, theme } from '../theme';

export type DialogEntry = {
  Component: () => JSX.Element;
  onClose?: () => void;
};

export type DialogContextValue = {
  replace: (Component: () => JSX.Element, onClose?: () => void) => void;
  push: (Component: () => JSX.Element, onClose?: () => void) => void;
  clear: () => void;
  readonly stack: DialogEntry[];
};

const DialogContext = createContext<DialogContextValue>();

export function DialogProvider(props: { children: JSX.Element }) {
  const renderer = useRenderer();
  const terminalSize = useTerminalDimensions();

  const [store, setStore] = createStore<{ stack: DialogEntry[] }>({ stack: [] });
  const [savedFocus, setSavedFocus] = createSignal<unknown>(null);

  const refocus = () => {
    const saved = savedFocus();
    if (saved && typeof (saved as { focus?: () => void }).focus === 'function') {
      try {
        (saved as { focus: () => void }).focus();
      } catch {
        // ignore
      }
    }
  };

  // Handle escape key to close dialogs
  useKeyboard((evt) => {
    if (evt.name === 'escape' && store.stack.length > 0) {
      const current = store.stack.at(-1)!;
      current.onClose?.();
      const nextStack = store.stack.slice(0, -1);
      setStore('stack', nextStack);
      evt.preventDefault();
      evt.stopPropagation();

      if (nextStack.length === 0) {
        refocus();
      }
    }
  });

  const saveFocusIfEmpty = () => {
    if (store.stack.length > 0) return;
    const currentFocused = (renderer as { currentFocusedRenderable?: unknown })
      .currentFocusedRenderable;
    setSavedFocus(currentFocused);
    if (
      currentFocused &&
      typeof (currentFocused as { blur?: () => void }).blur === 'function'
    ) {
      (currentFocused as { blur: () => void }).blur();
    }
  };

  const contextValue: DialogContextValue = {
    replace: (Component: () => JSX.Element, onClose?: () => void) => {
      saveFocusIfEmpty();
      setStore('stack', [{ Component, onClose }]);
    },
    push: (Component: () => JSX.Element, onClose?: () => void) => {
      saveFocusIfEmpty();
      setStore('stack', [...store.stack, { Component, onClose }]);
    },
    clear: () => {
      setStore('stack', []);
      refocus();
    },
    get stack() {
      return store.stack;
    }
  };

  const currentDialog = () => store.stack.at(-1);

  return (
    <DialogContext.Provider value={contextValue}>
      {props.children}
      <Show when={currentDialog()}>
        {(dialog: Accessor<DialogEntry>) => (
          <box
            position="absolute"
            left={0}
            top={0}
            width={terminalSize().width}
            height={terminalSize().height}
            backgroundColor={RGBA.fromInts(0, 0, 0, 150)}
          >
            <box
              width="100%"
              height="100%"
              alignItems="center"
              paddingTop={Math.floor(terminalSize().height / 4)}
            >
              <box
                width={60}
                maxWidth={terminalSize().width - 2}
                backgroundColor={rgba(theme.backgroundPanel)}
                borderStyle="rounded"
                borderColor={rgba(theme.border)}
              >
                {dialog().Component()}
              </box>
            </box>
          </box>
        )}
      </Show>
    </DialogContext.Provider>
  );
}

export function useDialog(): DialogContextValue {
  const ctx = useContext(DialogContext);
  if (!ctx) {
    throw new Error('useDialog must be used within DialogProvider');
  }
  return ctx;
}
