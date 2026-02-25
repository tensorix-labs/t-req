import { Compartment, EditorState, Prec } from '@codemirror/state';
import { EditorView, keymap, placeholder } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { createEffect, For, on, onCleanup, onMount, Show } from 'solid-js';
import { type RequestOption, toRequestIndex } from '../../utils/request-workspace';
import { formatUnresolvedVariablesPreview } from '../../utils/template-variables';
import {
  createTemplateCodeMirrorExtensions,
  type TemplateTokenResolver
} from './template-codemirror';

type RequestUrlBarProps = {
  method: string;
  url: string;
  resolvedUrlPreview?: string;
  requestOptions: RequestOption[];
  selectedRequestIndex: number;
  disabled?: boolean;
  sendDisabled?: boolean;
  isSending?: boolean;
  onRequestIndexChange: (requestIndex: number) => void;
  onUrlChange: (url: string) => void;
  onSend: () => void;
  resolveTemplateToken?: TemplateTokenResolver;
  templateRefreshKey?: string;
  unresolvedVariables?: string[];
};

type UrlCodeEditorProps = {
  value: string;
  disabled?: boolean;
  sendDisabled?: boolean;
  onChange: (value: string) => void;
  onSend?: () => void;
  resolveTemplateToken?: TemplateTokenResolver;
  templateRefreshKey?: string;
};

function UrlCodeEditor(props: UrlCodeEditorProps) {
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
        placeholder('https://api.example.com'),
        templateCompartment.of(templateExtensions()),
        editableCompartment.of(EditorView.editable.of(!props.disabled)),
        readOnlyCompartment.of(EditorState.readOnly.of(Boolean(props.disabled))),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged || isApplyingExternalValue) {
            return;
          }

          const nextValue = update.state.doc.toString();
          const sanitizedValue = nextValue.replace(/[\r\n]+/g, '');
          if (sanitizedValue !== nextValue) {
            isApplyingExternalValue = true;
            update.view.dispatch({
              changes: {
                from: 0,
                to: update.state.doc.length,
                insert: sanitizedValue
              }
            });
            isApplyingExternalValue = false;
            props.onChange(sanitizedValue);
            return;
          }

          props.onChange(nextValue);
        }),
        Prec.high(
          keymap.of([
            {
              key: 'Enter',
              run: () => {
                if (props.disabled || props.sendDisabled) {
                  return true;
                }
                props.onSend?.();
                return true;
              }
            }
          ])
        ),
        EditorView.theme({
          '&': {
            height: '100%',
            fontSize: '0.875rem'
          },
          '.cm-scroller': {
            overflow: 'hidden',
            fontFamily: 'var(--font-mono)'
          },
          '.cm-content': {
            padding: '0.42rem 0.62rem',
            lineHeight: '1.15rem'
          },
          '.cm-line': {
            padding: 0
          },
          '.cm-activeLine': {
            backgroundColor: 'transparent'
          },
          '.cm-gutters': {
            display: 'none'
          },
          '.cm-focused': {
            outline: 'none'
          },
          '.cm-editor.cm-focused': {
            outline: 'none'
          },
          '.cm-cursor, .cm-dropCursor': {
            borderLeftColor: '#ffffff',
            borderLeftWidth: '2px'
          },
          '.cm-selectionBackground, .cm-content ::selection': {
            backgroundColor: 'rgb(255 255 255 / 0.2)'
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

  onCleanup(() => {
    if (view) {
      view.destroy();
    }
  });

  return <div class="h-full min-h-0 min-w-0 overflow-visible" ref={container} />;
}

export function RequestUrlBar(props: RequestUrlBarProps) {
  const unresolvedVariables = () => props.unresolvedVariables ?? [];
  const sendDisabled = () => props.sendDisabled || props.disabled || props.isSending;
  const showResolvedPreview = () =>
    Boolean(props.resolvedUrlPreview) && props.resolvedUrlPreview !== props.url;

  return (
    <section class="border-b border-base-300 bg-base-200/20 px-3 py-2.5" aria-label="Request URL">
      <div class="flex flex-col gap-1.5">
        <div class="flex flex-wrap items-center gap-2">
          <Show when={props.requestOptions.length > 1}>
            <select
              class="select select-sm w-[190px] max-w-full border-base-300 bg-base-100 font-mono text-sm"
              value={String(props.selectedRequestIndex)}
              onInput={(event) => {
                const nextIndex = toRequestIndex(event.currentTarget.value);
                if (nextIndex === undefined) {
                  return;
                }
                props.onRequestIndexChange(nextIndex);
              }}
              disabled={props.disabled}
              aria-label="Request selection"
            >
              <For each={props.requestOptions}>
                {(option) => <option value={String(option.index)}>{option.label}</option>}
              </For>
            </select>
          </Show>
          <span class="badge badge-sm border-base-300 bg-base-300/60 px-2.5 font-mono text-[11px]">
            {props.method}
          </span>
          <div class="h-9 min-w-[260px] flex-1 rounded-btn border border-base-300 bg-base-100">
            <UrlCodeEditor
              value={props.url}
              disabled={props.disabled}
              sendDisabled={sendDisabled()}
              onChange={props.onUrlChange}
              onSend={props.onSend}
              resolveTemplateToken={props.resolveTemplateToken}
              templateRefreshKey={props.templateRefreshKey}
            />
          </div>
          <button
            type="button"
            class="btn btn-primary btn-sm"
            onClick={props.onSend}
            disabled={sendDisabled()}
            aria-busy={props.isSending}
          >
            {props.isSending ? 'Sending…' : 'Send'}
          </button>
        </div>

        <Show when={unresolvedVariables().length > 0}>
          <p class="text-[11px] font-mono text-warning">
            Unresolved URL variables: {formatUnresolvedVariablesPreview(unresolvedVariables())}
          </p>
        </Show>

        <Show when={showResolvedPreview()}>
          <p class="text-[11px] font-mono text-base-content/70">
            Resolved URL: {props.resolvedUrlPreview}
          </p>
        </Show>
      </div>
    </section>
  );
}
