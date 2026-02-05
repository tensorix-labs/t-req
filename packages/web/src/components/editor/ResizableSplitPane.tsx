import { type Component, type JSX, createSignal, onMount, onCleanup } from 'solid-js';

interface ResizableSplitPaneProps {
  left: JSX.Element;
  right: JSX.Element;
  initialSplit?: number;      // 0-100, default 60
  minLeftWidth?: number;      // pixels, default 300
  minRightWidth?: number;     // pixels, default 300
  storageKey?: string;        // localStorage key
  collapsed?: boolean;        // controlled collapse state
  onCollapseChange?: (collapsed: boolean) => void;
}

export const ResizableSplitPane: Component<ResizableSplitPaneProps> = (props) => {
  const defaultSplit = props.initialSplit ?? 60;
  const minLeftWidth = props.minLeftWidth ?? 300;
  const minRightWidth = props.minRightWidth ?? 300;
  const storageKey = props.storageKey ?? 'treq:editor:splitPosition';

  // Load initial split from localStorage if available
  const loadedSplit = () => {
    if (typeof localStorage === 'undefined') return defaultSplit;
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      const parsed = parseFloat(stored);
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) {
        return parsed;
      }
    }
    return defaultSplit;
  };

  const [splitPercent, setSplitPercent] = createSignal(loadedSplit());
  const [isDragging, setIsDragging] = createSignal(false);
  let containerRef: HTMLDivElement | undefined;

  const saveSplit = (value: number) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(storageKey, value.toString());
    }
  };

  const handleMouseDown = (e: MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging() || !containerRef) return;

    const rect = containerRef.getBoundingClientRect();
    const containerWidth = rect.width;
    const mouseX = e.clientX - rect.left;

    // Calculate percentage
    let newPercent = (mouseX / containerWidth) * 100;

    // Enforce minimum widths
    const minLeftPercent = (minLeftWidth / containerWidth) * 100;
    const maxLeftPercent = 100 - (minRightWidth / containerWidth) * 100;

    newPercent = Math.max(minLeftPercent, Math.min(maxLeftPercent, newPercent));

    setSplitPercent(newPercent);
  };

  const handleMouseUp = () => {
    if (isDragging()) {
      setIsDragging(false);
      saveSplit(splitPercent());
    }
  };

  const handleDoubleClick = () => {
    setSplitPercent(defaultSplit);
    saveSplit(defaultSplit);
  };

  onMount(() => {
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  });

  onCleanup(() => {
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  });

  const collapsed = () => props.collapsed ?? false;

  return (
    <div
      ref={containerRef}
      class="flex h-full overflow-hidden"
      classList={{ 'select-none': isDragging() }}
    >
      {/* Left panel */}
      <div
        class="h-full overflow-hidden"
        style={{
          width: collapsed() ? '100%' : `${splitPercent()}%`,
          transition: isDragging() ? 'none' : 'width 150ms ease-out'
        }}
      >
        {props.left}
      </div>

      {/* Divider */}
      <div
        class="relative h-full shrink-0 group"
        classList={{
          'hidden': collapsed(),
          'cursor-col-resize': !collapsed()
        }}
        style={{ width: '6px' }}
        onMouseDown={handleMouseDown}
        onDblClick={handleDoubleClick}
      >
        {/* Visual divider line */}
        <div
          class="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-treq-border dark:bg-treq-dark-border transition-colors duration-150"
          classList={{
            'bg-treq-accent dark:bg-treq-accent': isDragging()
          }}
        />
        {/* Hover/drag indicator */}
        <div
          class="absolute inset-y-0 left-1/2 -translate-x-1/2 w-1 opacity-0 bg-treq-accent/50 transition-opacity duration-150"
          classList={{
            'opacity-100': isDragging(),
            'group-hover:opacity-100': !isDragging()
          }}
        />
      </div>

      {/* Right panel */}
      <div
        class="h-full overflow-hidden"
        classList={{ 'hidden': collapsed() }}
        style={{
          flex: collapsed() ? '0' : '1',
          'min-width': collapsed() ? '0' : `${minRightWidth}px`,
          transition: isDragging() ? 'none' : 'flex 150ms ease-out, min-width 150ms ease-out'
        }}
      >
        {props.right}
      </div>
    </div>
  );
};
