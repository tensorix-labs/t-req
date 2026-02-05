import { For } from 'solid-js';
import { useWorkspace } from '../../context';
import { FileTreeItem } from './FileTreeItem';
import { isOpenableFile } from '../../utils/fileType';

export function FileTree(props: { onFileOpen?: (path: string) => void }) {
  const store = useWorkspace();

  const handleSelect = (path: string) => {
    const flatNode = store.flattenedVisible().find(f => f.node.path === path);
    if (flatNode?.node.isDir) {
      store.toggleDir(path);
    } else {
      store.setSelectedPath(path);
      // Open file in editor if it's a supported file type
      if (isOpenableFile(path)) {
        store.openFile(path);
        props.onFileOpen?.(path);
      }
    }
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
          />
        )}
      </For>
    </div>
  );
}
