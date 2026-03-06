import { createSignal } from 'solid-js';

const COLLAPSE_STORAGE_KEY = 'treq:editor:resultsPanelCollapsed';

interface UseEditorPanelStateReturn {
  collapsed: () => boolean;
  setCollapsed: (value: boolean) => void;
  toggle: () => void;
}

function loadCollapsedState(): boolean {
  if (typeof localStorage === 'undefined') return true;
  const stored = localStorage.getItem(COLLAPSE_STORAGE_KEY);
  return stored === 'true';
}

function saveCollapsedState(collapsed: boolean): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(COLLAPSE_STORAGE_KEY, collapsed.toString());
  }
}

export function useEditorPanelState(): UseEditorPanelStateReturn {
  // Initialize with localStorage value to avoid UI flash on first render
  const [collapsed, setCollapsed] = createSignal(loadCollapsedState());

  const toggle = () => {
    const newState = !collapsed();
    setCollapsed(newState);
    saveCollapsedState(newState);
  };

  const setCollapsedWithPersistence = (value: boolean) => {
    setCollapsed(value);
    saveCollapsedState(value);
  };

  return {
    collapsed,
    setCollapsed: setCollapsedWithPersistence,
    toggle
  };
}
