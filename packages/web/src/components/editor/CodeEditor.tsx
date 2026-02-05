import { type Component, createEffect, createSignal, on, onCleanup, onMount } from 'solid-js';
import { basicSetup } from 'codemirror';
import { EditorView, keymap } from '@codemirror/view';
import { EditorState, Prec } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { useWorkspace } from '../../context/workspace';

interface CodeEditorProps {
  path: string;
  onExecute?: () => void;
}

function getLanguageExtension(path: string) {
  const ext = path.substring(path.lastIndexOf('.')).toLowerCase();
  if (ext === '.py') return python();
  // Default to JavaScript/TypeScript for .js, .ts, .mjs, .mts, etc.
  return javascript({ typescript: ext === '.ts' || ext === '.mts' });
}

export const CodeEditor: Component<CodeEditorProps> = (props) => {
  const store = useWorkspace();
  let editorContainer: HTMLDivElement | undefined;
  const [editorView, setEditorView] = createSignal<EditorView | undefined>(undefined);
  const [isProgrammaticUpdate, setIsProgrammaticUpdate] = createSignal(false);

  // Get content from store
  const content = () => store.fileContents()[props.path]?.content ?? '';
  const isLoading = () => store.fileContents()[props.path]?.isLoading ?? false;
  const hasUnsavedChanges = () => store.hasUnsavedChanges(props.path);

  // Sync external content changes (file switch, reload from server)
  // Use on() for explicit dependency tracking to avoid memory leaks
  createEffect(
    on([editorView, content], ([view, newContent]) => {
      if (view && view.state.doc.toString() !== newContent) {
        setIsProgrammaticUpdate(true);
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: newContent }
        });
        setIsProgrammaticUpdate(false);
      }
    })
  );

  onMount(() => {
    if (!editorContainer) return;

    const state = EditorState.create({
      doc: content(),
      extensions: [
        basicSetup,
        getLanguageExtension(props.path),
        oneDark,
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !isProgrammaticUpdate()) {
            store.updateFileContent(props.path, update.state.doc.toString());
          }
        }),
        // Prevent browser default for Ctrl+S (save page dialog)
        EditorView.domEventHandlers({
          keydown: (event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === 's') {
              event.preventDefault();
              store.saveFile(props.path);
              return false;
            }
            return false;
          }
        }),
        Prec.high(
          keymap.of([
            {
              key: 'Ctrl-s',
              mac: 'Cmd-s',
              run: () => {
                store.saveFile(props.path);
                return true;
              }
            },
            {
              key: 'Ctrl-Enter',
              mac: 'Cmd-Enter',
              run: () => {
                props.onExecute?.();
                return true;
              }
            }
          ])
        ),
        EditorView.theme({
          '&': {
            height: '100%',
            fontSize: '14px'
          },
          '.cm-scroller': {
            overflow: 'auto',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
          },
          '.cm-content': {
            padding: '16px'
          }
        })
      ]
    });

    const view = new EditorView({
      state,
      parent: editorContainer
    });

    setEditorView(view);

    onCleanup(() => {
      view.destroy();
    });
  });

  return (
    <div class="flex flex-col h-full bg-[#1e1e1e]">
      {isLoading() && (
        <div class="px-4 py-2 bg-treq-surface dark:bg-treq-dark-surface text-treq-text-secondary text-sm border-b border-treq-border dark:border-treq-dark-border">
          Loading...
        </div>
      )}

      <div class="flex-1 min-h-0 overflow-hidden" ref={editorContainer} />

      {hasUnsavedChanges() && (
        <div class="px-4 py-2 bg-treq-accent/10 text-treq-accent text-sm border-t border-treq-border dark:border-treq-dark-border flex items-center justify-between">
          <span>Unsaved changes</span>
          <span class="text-xs opacity-70">Press Ctrl+S to save</span>
        </div>
      )}
    </div>
  );
};

export default CodeEditor;
