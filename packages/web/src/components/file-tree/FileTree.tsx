import { For } from 'solid-js';
import { useWorkspace, useScriptRunner } from '../../context';
import { FileTreeItem } from './FileTreeItem';

export function FileTree() {
  const store = useWorkspace();
  const scriptRunner = useScriptRunner();

  const handleSelect = (path: string) => {
    const flatNode = store.flattenedVisible().find(f => f.node.path === path);
    if (flatNode?.node.isDir) {
      store.toggleDir(path);
    } else {
      store.setSelectedPath(path);
    }
  };

  const handleRunScript = (path: string) => {
    // Select the file first, then run it
    store.setSelectedPath(path);
    void scriptRunner.runScript(path);
  };

  return (
    <div class="flex flex-col gap-0.5 py-2">
      <For each={store.flattenedVisible()}>
        {(flatNode) => (
          <FileTreeItem
            flatNode={flatNode}
            isSelected={store.selectedPath() === flatNode.node.path}
            onSelect={() => handleSelect(flatNode.node.path)}
            onToggle={() => store.toggleDir(flatNode.node.path)}
            onRunScript={handleRunScript}
          />
        )}
      </For>
    </div>
  );
}
