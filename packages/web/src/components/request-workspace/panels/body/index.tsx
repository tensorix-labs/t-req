import { Match, Show, Switch } from 'solid-js';
import { ErrorBanner } from '../shared';
import { FileBodyEditor } from './file-editor';
import { FormDataEditor } from './form-data-editor';
import { InlineBodyEditor } from './inline-editor';
import type { BodyPanelProps } from './types';

export function BodyPanel(props: BodyPanelProps) {
  const shouldShowDescription = () =>
    props.requestBodySummary.description !== 'Request includes an inline body payload.';

  return (
    <div class="space-y-2">
      <ErrorBanner message={props.bodyDraftSaveError} />

      <Show when={shouldShowDescription()}>
        <p>{props.requestBodySummary.description}</p>
      </Show>

      <Switch
        fallback={
          <p class="font-mono text-xs text-base-content/70">
            Unsupported body kind: {props.requestBodySummary.kind}
          </p>
        }
      >
        <Match when={props.requestBodySummary.kind === 'inline'}>
          <InlineBodyEditor
            hasRequest={props.hasRequest}
            requestBodyDraft={props.requestBodyDraft}
            requestBodySummary={props.requestBodySummary}
            bodyDraftDirty={props.bodyDraftDirty}
            bodyDraftSaving={props.bodyDraftSaving}
            bodyDraftValidationError={props.bodyDraftValidationError}
            bodyDraftIsJsonEditable={props.bodyDraftIsJsonEditable}
            bodyDraftTemplateWarnings={props.bodyDraftTemplateWarnings}
            onBodyChange={props.onBodyChange}
            onBodyPrettify={props.onBodyPrettify}
            onBodyMinify={props.onBodyMinify}
            onBodyCopy={props.onBodyCopy}
            onSaveBody={props.onSaveBody}
            onDiscardBody={props.onDiscardBody}
          />
        </Match>

        <Match when={props.requestBodySummary.kind === 'form-data'}>
          <FormDataEditor
            hasRequest={props.hasRequest}
            requestBodyFormDataDraft={props.requestBodyFormDataDraft}
            bodyDraftDirty={props.bodyDraftDirty}
            bodyDraftSaving={props.bodyDraftSaving}
            onBodyFormDataNameChange={props.onBodyFormDataNameChange}
            onBodyFormDataTypeChange={props.onBodyFormDataTypeChange}
            onBodyFormDataValueChange={props.onBodyFormDataValueChange}
            onBodyFormDataFilenameChange={props.onBodyFormDataFilenameChange}
            onBodyFormDataAddField={props.onBodyFormDataAddField}
            onBodyFormDataRemoveField={props.onBodyFormDataRemoveField}
            onSaveBody={props.onSaveBody}
            onDiscardBody={props.onDiscardBody}
          />
        </Match>

        <Match when={props.requestBodySummary.kind === 'file'}>
          <FileBodyEditor
            hasRequest={props.hasRequest}
            requestBodyFilePathDraft={props.requestBodyFilePathDraft}
            bodyDraftDirty={props.bodyDraftDirty}
            bodyDraftSaving={props.bodyDraftSaving}
            onBodyFilePathChange={props.onBodyFilePathChange}
            onBodyCopy={props.onBodyCopy}
            onSaveBody={props.onSaveBody}
            onDiscardBody={props.onDiscardBody}
          />
        </Match>
      </Switch>
    </div>
  );
}

// Re-export types for backward compatibility
export type {
  BodyPanelProps,
  FileBodyEditorProps,
  FormDataEditorProps,
  InlineBodyEditorProps
} from './types';
