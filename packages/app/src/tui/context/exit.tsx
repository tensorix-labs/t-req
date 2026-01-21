import { useRenderer } from '@opentui/solid';
import { createContext, onMount, useContext, type JSX } from 'solid-js';

export type ExitFn = (reason?: unknown) => Promise<void>;

const ExitContext = createContext<ExitFn>();

function formatExitReason(reason: unknown): string | undefined {
  if (!reason) return undefined;
  if (reason instanceof Error) return reason.stack || reason.message;
  return typeof reason === 'string' ? reason : undefined;
}

export function ExitProvider(props: {
  children: JSX.Element;
  onExit?: (reason?: unknown) => Promise<void> | void;
  register?: (exit: ExitFn) => void;
}) {
  const renderer = useRenderer();

  const exit: ExitFn = async (reason?: unknown) => {
    // Best-effort cleanup. OpenTUI needs destroy() to restore terminal state.
    try {
      (renderer as unknown as { setTerminalTitle?: (title: string) => void }).setTerminalTitle?.('');
    } catch {
      // ignore
    }

    try {
      renderer.destroy();
    } catch {
      // ignore
    }

    await props.onExit?.(reason);

    const formatted = formatExitReason(reason);
    if (formatted) {
      try {
        process.stderr.write(`${formatted}\n`);
      } catch {
        // ignore
      }
    }

    // Ensure we don't hang due to lingering handles (in-flight fetch, timers, etc.).
    process.exit(0);
  };

  onMount(() => {
    props.register?.(exit);
  });

  return <ExitContext.Provider value={exit}>{props.children}</ExitContext.Provider>;
}

export function useExit(): ExitFn {
  const ctx = useContext(ExitContext);
  if (!ctx) {
    throw new Error('useExit must be used within ExitProvider');
  }
  return ctx;
}

