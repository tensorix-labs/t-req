import { useKeyboard } from '@opentui/solid';
import type { ParsedKey } from '@opentui/core';
import { createContext, createMemo, onCleanup, useContext, type JSX } from 'solid-js';
import { Keybind } from '../util/keybind';
import { normalizeKey } from '../util/normalize-key';

export type KeybindAction = 'command_list' | 'debug_console' | 'file_picker' | 'quit' | 'open_in_editor';

export type KeyEventSnapshot = {
  at: number;
  raw: {
    name: string;
    ctrl: boolean;
    meta: boolean;
    shift: boolean;
    super: boolean;
  };
  normalized: {
    name: string;
    ctrl: boolean;
    meta: boolean;
    shift: boolean;
    super: boolean;
  };
  rawCode?: number;
};

export type KeybindContextValue = {
  match: (action: KeybindAction, evt: ParsedKey) => boolean;
  print: (action: KeybindAction) => string;
  recent: () => KeyEventSnapshot[];
};

const DEFAULTS: Record<KeybindAction, string> = {
  command_list: 'ctrl+p',
  debug_console: 'ctrl+`',
  file_picker: 'ctrl+t',
  quit: 'ctrl+c',
  open_in_editor: 'ctrl+e'
};

const KeybindContext = createContext<KeybindContextValue>();

function infoOf(evt: ParsedKey): Keybind.Info {
  const normalized = normalizeKey(evt);

  // Normalize single-letter names to lowercase.
  const name =
    typeof normalized.name === 'string' && normalized.name.length === 1
      ? normalized.name.toLowerCase()
      : normalized.name;

  return Keybind.fromParsedKey({ ...normalized, name });
}

export function KeybindProvider(props: { children: JSX.Element }) {
  const parsedDefaults = createMemo(() => {
    return {
      command_list: Keybind.parse(DEFAULTS.command_list),
      debug_console: Keybind.parse(DEFAULTS.debug_console),
      file_picker: Keybind.parse(DEFAULTS.file_picker),
      quit: Keybind.parse(DEFAULTS.quit),
      open_in_editor: Keybind.parse(DEFAULTS.open_in_editor)
    } satisfies Record<KeybindAction, Keybind.Info[]>;
  });

  // Use a plain mutable array instead of a signal to avoid reactive updates
  // on every keypress. This is only used for debug console inspection.
  let recentEvents: KeyEventSnapshot[] = [];

  useKeyboard((evt) => {
    // Capture a small ring buffer of key events for in-app inspection.
    const rawName = typeof evt.name === 'string' ? evt.name : '';
    const rawCode = rawName.length === 1 ? rawName.charCodeAt(0) : undefined;
    const raw = {
      name: rawName,
      ctrl: evt.ctrl === true,
      meta: evt.meta === true,
      shift: evt.shift === true,
      super: (evt.super ?? false) === true
    };
    const normalizedInfo = infoOf(evt);
    recentEvents.push({
      at: Date.now(),
      raw,
      normalized: {
        name: normalizedInfo.name,
        ctrl: normalizedInfo.ctrl ?? false,
        meta: normalizedInfo.meta ?? false,
        shift: normalizedInfo.shift ?? false,
        super: normalizedInfo.super ?? false
      },
      rawCode
    });
    if (recentEvents.length > 60) {
      recentEvents = recentEvents.slice(-60);
    }
  });

  const value: KeybindContextValue = {
    match(action, evt) {
      const expected = parsedDefaults()[action];
      const actual = infoOf(evt);
      for (const key of expected) {
        if (Keybind.match(key, actual)) return true;
      }
      return false;
    },
    print(action) {
      // For now, we only support defaults (no user overrides yet).
      const first = parsedDefaults()[action][0];
      return Keybind.stringify(first);
    },
    recent: () => recentEvents
  };

  // No resources to cleanup; keep placeholder for future overrides.
  onCleanup(() => { });

  return <KeybindContext.Provider value={value}>{props.children}</KeybindContext.Provider>;
}

export function useKeybind(): KeybindContextValue {
  const ctx = useContext(KeybindContext);
  if (!ctx) {
    throw new Error('useKeybind must be used within KeybindProvider');
  }
  return ctx;
}

