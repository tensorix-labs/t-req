import { createContext, createSignal, type JSX, useContext } from 'solid-js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogEntry = {
  at: number;
  level: LogLevel;
  message: string;
  data?: unknown;
};

export type LogContextValue = {
  entries: () => LogEntry[];
  debug: (message: string, data?: unknown) => void;
  info: (message: string, data?: unknown) => void;
  warn: (message: string, data?: unknown) => void;
  error: (message: string, data?: unknown) => void;
  clear: () => void;
};

const MAX_ENTRIES = 100;

const LogContext = createContext<LogContextValue>();

export function LogProvider(props: { children: JSX.Element }) {
  const [entries, setEntries] = createSignal<LogEntry[]>([]);

  const addEntry = (level: LogLevel, message: string, data?: unknown) => {
    setEntries((prev) => {
      const next: LogEntry[] = [
        ...prev,
        {
          at: Date.now(),
          level,
          message,
          data
        }
      ];
      return next.length > MAX_ENTRIES ? next.slice(next.length - MAX_ENTRIES) : next;
    });
  };

  const value: LogContextValue = {
    entries,
    debug: (message, data) => addEntry('debug', message, data),
    info: (message, data) => addEntry('info', message, data),
    warn: (message, data) => addEntry('warn', message, data),
    error: (message, data) => addEntry('error', message, data),
    clear: () => setEntries([])
  };

  return <LogContext.Provider value={value}>{props.children}</LogContext.Provider>;
}

export function useLog(): LogContextValue {
  const ctx = useContext(LogContext);
  if (!ctx) {
    throw new Error('useLog must be used within LogProvider');
  }
  return ctx;
}
