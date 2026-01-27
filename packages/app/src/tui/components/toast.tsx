import { createContext, useContext, Show, type Accessor, type ParentProps } from 'solid-js';
import { createStore } from 'solid-js/store';
import { useTerminalDimensions } from '@opentui/solid';
import { theme, rgba } from '../theme';

export type ToastVariant = 'info' | 'error' | 'success' | 'warning';

export interface ToastOptions {
  variant: ToastVariant;
  title?: string;
  message: string;
  duration?: number;
}

type ToastDisplay = Omit<ToastOptions, 'duration'>;

function variantColor(variant: ToastVariant): string {
  switch (variant) {
    case 'info':
      return theme.info;
    case 'error':
      return theme.error;
    case 'success':
      return theme.success;
    case 'warning':
      return theme.warning;
  }
}

function init() {
  const [store, setStore] = createStore({
    currentToast: null as ToastDisplay | null
  });

  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  const toast = {
    show(options: ToastOptions) {
      const { duration = 3000, ...display } = options;
      setStore('currentToast', display);
      if (timeoutHandle) clearTimeout(timeoutHandle);
      timeoutHandle = setTimeout(() => {
        setStore('currentToast', null);
      }, duration);
      timeoutHandle.unref?.();
    },
    dismiss() {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      setStore('currentToast', null);
    },
    get currentToast(): ToastDisplay | null {
      return store.currentToast;
    }
  };

  return toast;
}

export type ToastContextValue = ReturnType<typeof init>;

const ToastContext = createContext<ToastContextValue>();

export function ToastProvider(props: ParentProps) {
  const value = init();
  return <ToastContext.Provider value={value}>{props.children}</ToastContext.Provider>;
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}

export function Toast() {
  const toast = useToast();
  const dimensions = useTerminalDimensions();

  return (
    <Show when={toast.currentToast}>
      {(current: Accessor<ToastDisplay>) => (
        <box
          position="absolute"
          top={2}
          right={2}
          maxWidth={Math.min(60, dimensions().width - 6)}
          paddingLeft={2}
          paddingRight={2}
          paddingTop={1}
          paddingBottom={1}
          backgroundColor={rgba(theme.backgroundPanel)}
          borderStyle="rounded"
          borderColor={rgba(variantColor(current().variant))}
        >
          <box flexDirection="column">
            <Show when={current().title}>
              <text fg={rgba(theme.text)} attributes={1}>
                {current().title}
              </text>
            </Show>
            <text fg={rgba(theme.text)}>{current().message}</text>
          </box>
        </box>
      )}
    </Show>
  );
}
