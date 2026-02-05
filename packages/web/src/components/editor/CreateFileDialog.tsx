import { createSignal, Show } from 'solid-js';
import { useWorkspace } from '../../context/workspace';

interface CreateFileDialogProps {
  isOpen: boolean;
  onClose: () => void;
  defaultPath?: string;
}

export function CreateFileDialog(props: CreateFileDialogProps) {
  const store = useWorkspace();
  const [filename, setFilename] = createSignal('');
  const [error, setError] = createSignal('');
  const [isCreating, setIsCreating] = createSignal(false);

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setError('');

    let name = filename().trim();
    if (!name) {
      setError('Filename is required');
      return;
    }

    // Auto-add .http extension if not present
    if (!name.endsWith('.http')) {
      name += '.http';
    }

    // Validate no path traversal
    if (name.includes('..') || name.includes('/')) {
      setError('Invalid filename - cannot contain .. or /');
      return;
    }

    const fullPath = props.defaultPath
      ? `${props.defaultPath}/${name}`
      : name;

    setIsCreating(true);
    try {
      await store.createFile(fullPath);
      setFilename('');
      props.onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsCreating(false);
    }
  };

  const handleClose = () => {
    setFilename('');
    setError('');
    props.onClose();
  };

  return (
    <Show when={props.isOpen}>
      <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div class="bg-treq-surface dark:bg-treq-dark-surface rounded-lg shadow-xl max-w-md w-full mx-4 overflow-hidden">
          <div class="px-6 py-4 border-b border-treq-border dark:border-treq-dark-border">
            <h2 class="text-lg font-semibold text-treq-text dark:text-treq-dark-text">
              New HTTP File
            </h2>
          </div>

          <form onSubmit={handleSubmit} class="p-6 space-y-4">
            <div>
              <label class="block text-sm text-treq-text-secondary mb-1.5">
                Filename
              </label>
              <input
                type="text"
                value={filename()}
                onInput={(e) => setFilename(e.currentTarget.value)}
                placeholder="example.http"
                class="w-full px-3 py-2 border border-treq-border dark:border-treq-dark-border rounded bg-treq-bg dark:bg-treq-dark-bg text-treq-text dark:text-treq-dark-text focus:outline-none focus:ring-2 focus:ring-treq-accent/50"
                autofocus
                disabled={isCreating()}
              />
              <p class="text-xs text-treq-text-secondary mt-1">
                .http extension will be added automatically
              </p>
            </div>

            <Show when={error()}>
              <div class="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded">
                {error()}
              </div>
            </Show>

            <div class="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={handleClose}
                disabled={isCreating()}
                class="px-4 py-2 text-sm text-treq-text-secondary hover:bg-treq-bg dark:hover:bg-treq-dark-bg rounded transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isCreating() || !filename().trim()}
                class="px-4 py-2 text-sm bg-treq-accent text-white rounded hover:bg-treq-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCreating() ? 'Creating...' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Show>
  );
}
