import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { createEffect, on, onCleanup, onMount } from 'solid-js';
import { createJsonCodeMirrorExtensions } from './json-codemirror';

type JsonResponseViewerProps = {
  value: string;
};

export function JsonResponseViewer(props: JsonResponseViewerProps) {
  let container: HTMLDivElement | undefined;
  let view: EditorView | undefined;

  onMount(() => {
    if (!container) {
      return;
    }

    const state = EditorState.create({
      doc: props.value,
      extensions: [
        basicSetup,
        ...createJsonCodeMirrorExtensions(),
        EditorState.readOnly.of(true),
        EditorView.editable.of(false)
      ]
    });

    view = new EditorView({
      parent: container,
      state
    });
  });

  createEffect(
    on(
      () => props.value,
      (nextValue) => {
        if (!view) {
          return;
        }

        const currentValue = view.state.doc.toString();
        if (currentValue === nextValue) {
          return;
        }

        view.dispatch({
          changes: {
            from: 0,
            to: view.state.doc.length,
            insert: nextValue
          }
        });
      }
    )
  );

  onCleanup(() => {
    if (view) {
      view.destroy();
    }
  });

  return <div class="h-full min-h-0 min-w-0 overflow-hidden" ref={container} />;
}
