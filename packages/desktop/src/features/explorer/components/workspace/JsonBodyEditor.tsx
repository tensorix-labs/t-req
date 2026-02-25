import { indentWithTab } from '@codemirror/commands';
import { Compartment, EditorState, Prec } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { createEffect, on, onCleanup, onMount } from 'solid-js';
import { createJsonCodeMirrorExtensions } from './json-codemirror';
import {
  createTemplateCodeMirrorExtensions,
  type TemplateTokenResolver
} from './template-codemirror';

type JsonBodyEditorProps = {
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onSaveRequest?: () => void;
  onFocusChange?: (focused: boolean) => void;
  resolveTemplateToken?: TemplateTokenResolver;
  templateRefreshKey?: string;
};

export function JsonBodyEditor(props: JsonBodyEditorProps) {
  let container: HTMLDivElement | undefined;
  let view: EditorView | undefined;
  let isApplyingExternalValue = false;

  const editableCompartment = new Compartment();
  const readOnlyCompartment = new Compartment();
  const templateCompartment = new Compartment();

  const templateExtensions = () =>
    createTemplateCodeMirrorExtensions({
      resolveToken: props.resolveTemplateToken
    });

  onMount(() => {
    if (!container) {
      return;
    }

    const state = EditorState.create({
      doc: props.value,
      extensions: [
        basicSetup,
        ...createJsonCodeMirrorExtensions(),
        templateCompartment.of(templateExtensions()),
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
    on([() => props.resolveTemplateToken, () => props.templateRefreshKey], () => {
      if (!view) {
        return;
      }

      view.dispatch({
        effects: templateCompartment.reconfigure(templateExtensions())
      });
    })
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
