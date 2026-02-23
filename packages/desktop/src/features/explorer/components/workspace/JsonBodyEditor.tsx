import { indentWithTab } from '@codemirror/commands';
import { json } from '@codemirror/lang-json';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { Compartment, EditorState, Prec } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { basicSetup } from 'codemirror';
import { createEffect, on, onCleanup, onMount } from 'solid-js';

type JsonBodyEditorProps = {
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onSaveRequest?: () => void;
  onFocusChange?: (focused: boolean) => void;
};

const jsonHighlightStyle = HighlightStyle.define([
  {
    tag: tags.propertyName,
    color: 'var(--app-editor-jb-key, #c792ea)'
  },
  {
    tag: [tags.string, tags.special(tags.string)],
    color: 'var(--app-editor-jb-string, #8dc891)'
  },
  {
    tag: [tags.number, tags.integer, tags.float],
    color: 'var(--app-editor-jb-number, #7aa2f7)'
  },
  {
    tag: [tags.bool, tags.null],
    color: 'var(--app-editor-jb-boolean, #e5c07b)'
  },
  {
    tag: [tags.punctuation, tags.bracket],
    color: 'var(--app-editor-jb-punctuation, #c8ccd4)'
  }
]);

const editorTheme = EditorView.theme(
  {
    '&': {
      height: '100%',
      backgroundColor: 'var(--app-editor-jb-bg, #2b2d3a)',
      color: 'var(--app-editor-jb-foreground, #d3dae3)'
    },
    '.cm-scroller': {
      overflow: 'auto',
      fontFamily: 'var(--font-mono)'
    },
    '.cm-content': {
      minHeight: '100%',
      padding: '0.5rem 0.625rem',
      fontSize: '0.75rem',
      lineHeight: '1.5rem',
      caretColor: 'var(--app-editor-jb-caret, #d3dae3)'
    },
    '.cm-focused': {
      outline: 'none'
    },
    '.cm-editor.cm-focused': {
      outline: 'none'
    },
    '.cm-activeLine': {
      backgroundColor: 'var(--app-editor-jb-active-line, #333a4a)'
    },
    '.cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: 'var(--app-editor-jb-selection, #2679db)'
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: 'var(--app-editor-jb-caret, #d3dae3)'
    },
    '.cm-gutters': {
      backgroundColor: 'var(--app-editor-jb-gutter-bg, #272b3a)',
      color: 'var(--app-editor-jb-gutter-fg, #7f8796)',
      borderRight: '1px solid var(--app-editor-jb-border, #3b4052)'
    },
    '.cm-lineNumbers .cm-gutterElement': {
      paddingInline: '0.5rem'
    }
  },
  { dark: true }
);

export function JsonBodyEditor(props: JsonBodyEditorProps) {
  let container: HTMLDivElement | undefined;
  let view: EditorView | undefined;
  let isApplyingExternalValue = false;

  const editableCompartment = new Compartment();
  const readOnlyCompartment = new Compartment();

  onMount(() => {
    if (!container) {
      return;
    }

    const state = EditorState.create({
      doc: props.value,
      extensions: [
        basicSetup,
        json(),
        syntaxHighlighting(jsonHighlightStyle),
        EditorView.lineWrapping,
        Prec.high(
          keymap.of([
            indentWithTab,
            {
              key: 'Mod-s',
              run: () => {
                if (props.disabled) {
                  return true;
                }
                props.onSaveRequest?.();
                return true;
              }
            }
          ])
        ),
        editableCompartment.of(EditorView.editable.of(!props.disabled)),
        readOnlyCompartment.of(EditorState.readOnly.of(Boolean(props.disabled))),
        editorTheme,
        EditorView.updateListener.of((update) => {
          if (!update.docChanged || isApplyingExternalValue) {
            return;
          }
          props.onChange(update.state.doc.toString());
        }),
        EditorView.domEventHandlers({
          focus: () => {
            props.onFocusChange?.(true);
            return false;
          },
          blur: () => {
            props.onFocusChange?.(false);
            return false;
          }
        })
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

        isApplyingExternalValue = true;
        view.dispatch({
          changes: {
            from: 0,
            to: view.state.doc.length,
            insert: nextValue
          }
        });
        isApplyingExternalValue = false;
      }
    )
  );

  createEffect(
    on(
      () => Boolean(props.disabled),
      (disabled) => {
        if (!view) {
          return;
        }

        view.dispatch({
          effects: [
            editableCompartment.reconfigure(EditorView.editable.of(!disabled)),
            readOnlyCompartment.reconfigure(EditorState.readOnly.of(disabled))
          ]
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
