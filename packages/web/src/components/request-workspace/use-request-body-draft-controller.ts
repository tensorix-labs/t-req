import { type Accessor, createEffect, createMemo, createSignal, on } from 'solid-js';
import type { WorkspaceRequest } from '../../sdk';
import { formatJsonBodyText, validateJsonBodyText } from '../../utils/request-body-json';
import type { ParseDiagnostic, RequestBodySummary } from '../../utils/request-details';
import { applySpanEditToContent } from '../../utils/request-editing';

interface UseRequestBodyDraftControllerInput {
  path: Accessor<string>;
  selectedRequest: Accessor<WorkspaceRequest | undefined>;
  sourceBody: Accessor<RequestBodySummary>;
  requestDiagnostics: Accessor<ParseDiagnostic[]>;
  getFileContent: Accessor<string | undefined>;
  setFileContent: (content: string) => void;
  saveFile: (path: string) => Promise<void>;
  reloadRequests: (path: string) => Promise<void>;
  refetchRequestDetails: () => Promise<unknown> | unknown;
}

interface UseRequestBodyDraftControllerReturn {
  draftBody: Accessor<string>;
  isJsonBody: Accessor<boolean>;
  templateWarnings: Accessor<string[]>;
  validationError: Accessor<string | undefined>;
  isDirty: Accessor<boolean>;
  isSaving: Accessor<boolean>;
  saveError: Accessor<string | undefined>;
  onBodyChange: (value: string) => void;
  onBodyPrettify: () => void;
  onBodyMinify: () => void;
  onBodyCopy: () => Promise<void>;
  onDiscard: () => void;
  onSave: () => Promise<void>;
}

const DEFAULT_SAVE_ERROR = 'Unable to save request body edits.';
const INVALID_JSON_SAVE_ERROR = 'Body JSON is invalid. Fix errors before saving.';
const UNAVAILABLE_BODY_EDITING_ERROR = 'Only inline JSON body editing is supported in this phase.';
const MISSING_BODY_SPAN_ERROR =
  'Unable to update body text because body span data was unavailable.';

const makeRequestKey = (
  path: string,
  request?: Pick<WorkspaceRequest, 'index'>
): string | undefined => (request ? `${path}:${request.index}` : undefined);

function isJsonContentType(contentType: string | undefined): boolean {
  if (!contentType) {
    return false;
  }

  const normalized = contentType.toLowerCase();
  return normalized.includes('/json') || normalized.includes('+json');
}

function isTemplateWarningDiagnostic(diagnostic: ParseDiagnostic): boolean {
  const normalizedCode = diagnostic.code.toLowerCase();
  if (normalizedCode.includes('variable') || normalizedCode.includes('template')) {
    return true;
  }

  const normalizedMessage = diagnostic.message.toLowerCase();
  return normalizedMessage.includes('variable') || normalizedMessage.includes('template');
}

function toErrorMessage(value: unknown): string {
  if (value instanceof Error && value.message) {
    return value.message;
  }
  return DEFAULT_SAVE_ERROR;
}

export function useRequestBodyDraftController(
  input: UseRequestBodyDraftControllerInput
): UseRequestBodyDraftControllerReturn {
  const sourceBodyText = createMemo(() => {
    const sourceBody = input.sourceBody();
    if (sourceBody.kind !== 'inline') {
      return '';
    }
    return sourceBody.text ?? '';
  });

  const isJsonBody = createMemo(() => {
    const sourceBody = input.sourceBody();
    if (sourceBody.kind !== 'inline') {
      return false;
    }

    return sourceBody.isJsonLike === true || isJsonContentType(sourceBody.contentType);
  });

  const toValidationError = (bodyText: string): string | undefined => {
    if (!isJsonBody()) {
      return undefined;
    }
    return validateJsonBodyText(bodyText);
  };

  const initialDraftKey = () => makeRequestKey(input.path(), input.selectedRequest());
  const [draftRequestKey, setDraftRequestKey] = createSignal<string | undefined>(initialDraftKey());
  const [draftBody, setDraftBody] = createSignal<string>(initialDraftKey() ? sourceBodyText() : '');
  const [validationError, setValidationError] = createSignal<string | undefined>(
    initialDraftKey() ? toValidationError(sourceBodyText()) : undefined
  );
  const [isDirty, setIsDirty] = createSignal(false);
  const [isSaving, setIsSaving] = createSignal(false);
  const [saveError, setSaveError] = createSignal<string | undefined>(undefined);

  const requestDraftKey = () => makeRequestKey(input.path(), input.selectedRequest());

  createEffect(
    on(requestDraftKey, (nextKey, previousKey) => {
      if (!nextKey) {
        setDraftRequestKey(undefined);
        setDraftBody('');
        setValidationError(undefined);
        setIsDirty(false);
        setIsSaving(false);
        setSaveError(undefined);
        return;
      }

      if (nextKey === previousKey) {
        return;
      }

      const nextBody = sourceBodyText();
      setDraftRequestKey(nextKey);
      setDraftBody(nextBody);
      setValidationError(toValidationError(nextBody));
      setIsDirty(false);
      setIsSaving(false);
      setSaveError(undefined);
    })
  );

  createEffect(
    on([requestDraftKey, sourceBodyText], ([nextKey, nextSourceBody]) => {
      if (!nextKey || draftRequestKey() !== nextKey || isDirty()) {
        return;
      }

      setDraftBody(nextSourceBody);
      setValidationError(toValidationError(nextSourceBody));
    })
  );

  const templateWarnings = createMemo(() => {
    const requestWarnings = input.requestDiagnostics().filter(isTemplateWarningDiagnostic);
    if (requestWarnings.length > 0) {
      return requestWarnings.map((warning) => warning.message);
    }

    if (draftBody().includes('{{')) {
      return ['Template variables in body are resolved at runtime.'];
    }

    return [];
  });

  const markDirty = () => {
    setIsDirty(true);
    setSaveError(undefined);
  };

  const onBodyChange = (value: string) => {
    setDraftBody(value);
    setValidationError(toValidationError(value));
    markDirty();
  };

  const formatBody = (mode: 'prettify' | 'minify') => {
    if (!isJsonBody()) {
      return;
    }

    const formatted = formatJsonBodyText(draftBody(), mode);
    if (!formatted.ok) {
      setValidationError(formatted.message);
      setSaveError(INVALID_JSON_SAVE_ERROR);
      return;
    }

    setDraftBody(formatted.text);
    setValidationError(undefined);
    markDirty();
  };

  const onBodyPrettify = () => formatBody('prettify');
  const onBodyMinify = () => formatBody('minify');

  const onBodyCopy = async () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      setSaveError('Clipboard is unavailable in this environment.');
      return;
    }

    try {
      await navigator.clipboard.writeText(draftBody());
    } catch (error) {
      setSaveError(toErrorMessage(error));
    }
  };

  const onDiscard = () => {
    const nextBody = sourceBodyText();
    setDraftBody(nextBody);
    setValidationError(toValidationError(nextBody));
    setIsDirty(false);
    setSaveError(undefined);
  };

  const onSave = async () => {
    if (isSaving()) {
      return;
    }

    const request = input.selectedRequest();
    const currentPath = input.path();
    const currentContent = input.getFileContent();
    const sourceBody = input.sourceBody();

    if (!request) {
      setSaveError('Select a request before saving body edits.');
      return;
    }

    if (currentContent === undefined) {
      setSaveError('Request file content is still loading. Try saving again.');
      return;
    }

    if (!isJsonBody() || sourceBody.kind !== 'inline') {
      setSaveError(UNAVAILABLE_BODY_EDITING_ERROR);
      return;
    }

    const nextValidationError = validateJsonBodyText(draftBody());
    if (nextValidationError) {
      setValidationError(nextValidationError);
      setSaveError(INVALID_JSON_SAVE_ERROR);
      return;
    }

    const bodySpan = sourceBody.spans?.body;
    if (!bodySpan) {
      setSaveError(MISSING_BODY_SPAN_ERROR);
      return;
    }

    const rewrite = applySpanEditToContent(currentContent, bodySpan, draftBody());
    if (!rewrite.ok) {
      setSaveError(rewrite.error);
      return;
    }

    input.setFileContent(rewrite.content);
    setIsSaving(true);
    setSaveError(undefined);

    try {
      await input.saveFile(currentPath);
      setIsDirty(false);
      await input.reloadRequests(currentPath);
      await input.refetchRequestDetails();
    } catch (error) {
      setSaveError(toErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  return {
    draftBody,
    isJsonBody,
    templateWarnings,
    validationError,
    isDirty,
    isSaving,
    saveError,
    onBodyChange,
    onBodyPrettify,
    onBodyMinify,
    onBodyCopy,
    onDiscard,
    onSave
  };
}
