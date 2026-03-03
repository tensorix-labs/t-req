import { type Accessor, createEffect, createMemo, createSignal, on } from 'solid-js';
import type { WorkspaceRequest } from '../../sdk';
import { formatJsonBodyText, validateJsonBodyText } from '../../utils/request-body-json';
import type {
  ParseDiagnostic,
  RequestBodyField,
  RequestBodySummary
} from '../../utils/request-details';
import { applySpanEditToContent } from '../../utils/request-editing';
import { cloneFormDataFields, serializeFormDataBody } from '../../utils/request-form-data';

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
  bodyMode: Accessor<RequestBodySummary['kind']>;
  draftBody: Accessor<string>;
  draftFormData: Accessor<RequestBodyField[]>;
  draftFilePath: Accessor<string>;
  isJsonBody: Accessor<boolean>;
  templateWarnings: Accessor<string[]>;
  validationError: Accessor<string | undefined>;
  isDirty: Accessor<boolean>;
  isSaving: Accessor<boolean>;
  saveError: Accessor<string | undefined>;
  onBodyChange: (value: string) => void;
  onFilePathChange: (value: string) => void;
  onFormDataNameChange: (index: number, value: string) => void;
  onFormDataTypeChange: (index: number, isFile: boolean) => void;
  onFormDataValueChange: (index: number, value: string) => void;
  onFormDataFilenameChange: (index: number, value: string) => void;
  onAddFormDataField: () => void;
  onRemoveFormDataField: (index: number) => void;
  onBodyPrettify: () => void;
  onBodyMinify: () => void;
  onBodyCopy: () => Promise<void>;
  onDiscard: () => void;
  onSave: () => Promise<void>;
}

const DEFAULT_SAVE_ERROR = 'Unable to save request body edits.';
const INVALID_JSON_SAVE_ERROR = 'Body JSON is invalid. Fix errors before saving.';
const UNAVAILABLE_BODY_EDITING_ERROR =
  'Editing this request body type is not supported in this phase.';
const MISSING_BODY_SPAN_ERROR =
  'Unable to update body text because body span data was unavailable.';
const EMPTY_FILE_PATH_ERROR = 'Body file path cannot be empty.';

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

function normalizeFileReferenceInput(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('<')) {
    return trimmed.slice(1).trim();
  }
  return trimmed;
}

function serializeFileBody(filePath: string): string {
  return `< ${normalizeFileReferenceInput(filePath)}`;
}

export function useRequestBodyDraftController(
  input: UseRequestBodyDraftControllerInput
): UseRequestBodyDraftControllerReturn {
  const bodyMode = createMemo<RequestBodySummary['kind']>(() => input.sourceBody().kind);
  const sourceBodyText = createMemo(() => {
    const sourceBody = input.sourceBody();
    if (sourceBody.kind !== 'inline') {
      return '';
    }
    return sourceBody.text ?? '';
  });
  const sourceFormData = createMemo(() => {
    const sourceBody = input.sourceBody();
    if (sourceBody.kind !== 'form-data') {
      return [];
    }
    return sourceBody.fields ?? [];
  });
  const sourceFilePath = createMemo(() => {
    const sourceBody = input.sourceBody();
    if (sourceBody.kind !== 'file') {
      return '';
    }
    return sourceBody.filePath ?? '';
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
  const [draftFormData, setDraftFormData] = createSignal<RequestBodyField[]>(
    initialDraftKey() ? cloneFormDataFields(sourceFormData()) : []
  );
  const [draftFilePath, setDraftFilePath] = createSignal<string>(
    initialDraftKey() ? sourceFilePath() : ''
  );
  const [validationError, setValidationError] = createSignal<string | undefined>(
    initialDraftKey() ? toValidationError(sourceBodyText()) : undefined
  );
  const [isDirty, setIsDirty] = createSignal(false);
  const [isSaving, setIsSaving] = createSignal(false);
  const [saveError, setSaveError] = createSignal<string | undefined>(undefined);

  const requestDraftKey = () => makeRequestKey(input.path(), input.selectedRequest());

  const resetDraftFromSource = () => {
    const nextBody = sourceBodyText();
    setDraftBody(nextBody);
    setDraftFormData(cloneFormDataFields(sourceFormData()));
    setDraftFilePath(sourceFilePath());
    setValidationError(toValidationError(nextBody));
  };

  createEffect(
    on(requestDraftKey, (nextKey, previousKey) => {
      if (!nextKey) {
        setDraftRequestKey(undefined);
        setDraftBody('');
        setDraftFormData([]);
        setDraftFilePath('');
        setValidationError(undefined);
        setIsDirty(false);
        setIsSaving(false);
        setSaveError(undefined);
        return;
      }

      if (nextKey === previousKey) {
        return;
      }

      setDraftRequestKey(nextKey);
      resetDraftFromSource();
      setIsDirty(false);
      setIsSaving(false);
      setSaveError(undefined);
    })
  );

  createEffect(
    on([requestDraftKey, sourceBodyText, sourceFormData, sourceFilePath], ([nextKey]) => {
      if (!nextKey || draftRequestKey() !== nextKey || isDirty()) {
        return;
      }

      resetDraftFromSource();
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

    if (draftFilePath().includes('{{')) {
      return ['Template variables in body file references are resolved at runtime.'];
    }

    const hasFormDataTemplateVariables = draftFormData().some((field) => {
      return field.value.includes('{{') || (field.path ?? '').includes('{{');
    });
    if (hasFormDataTemplateVariables) {
      return ['Template variables in form-data fields are resolved at runtime.'];
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

  const onFilePathChange = (value: string) => {
    setDraftFilePath(value);
    markDirty();
  };

  const updateDraftFormDataRows = (
    fields: RequestBodyField[],
    index: number,
    update: (field: RequestBodyField) => RequestBodyField
  ): RequestBodyField[] => {
    if (index < 0 || index >= fields.length) {
      return fields;
    }

    return fields.map((field, fieldIndex) => {
      if (fieldIndex !== index) {
        return field;
      }
      return update(field);
    });
  };

  const onFormDataNameChange = (index: number, value: string) => {
    setDraftFormData((fields) =>
      updateDraftFormDataRows(fields, index, (field) => ({
        ...field,
        name: value
      }))
    );
    markDirty();
  };

  const onFormDataTypeChange = (index: number, isFile: boolean) => {
    setDraftFormData((fields) =>
      updateDraftFormDataRows(fields, index, (field) => {
        if (!isFile) {
          return {
            name: field.name,
            value: field.value,
            isFile: false
          };
        }

        const filename = field.filename?.trim();
        return {
          name: field.name,
          value: '',
          isFile: true,
          path: field.path ?? '',
          ...(filename ? { filename } : {})
        };
      })
    );
    markDirty();
  };

  const onFormDataValueChange = (index: number, value: string) => {
    setDraftFormData((fields) =>
      updateDraftFormDataRows(fields, index, (field) => {
        if (field.isFile) {
          return {
            ...field,
            path: value
          };
        }

        return {
          ...field,
          value
        };
      })
    );
    markDirty();
  };

  const onFormDataFilenameChange = (index: number, value: string) => {
    setDraftFormData((fields) =>
      updateDraftFormDataRows(fields, index, (field) => {
        const filename = value.trim();
        if (!filename) {
          const nextField = { ...field };
          delete nextField.filename;
          return nextField;
        }

        return {
          ...field,
          filename
        };
      })
    );
    markDirty();
  };

  const onAddFormDataField = () => {
    setDraftFormData((fields) => [...fields, { name: '', value: '', isFile: false }]);
  };

  const onRemoveFormDataField = (index: number) => {
    setDraftFormData((fields) => fields.filter((_, fieldIndex) => fieldIndex !== index));
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
    const bodyText =
      bodyMode() === 'form-data'
        ? serializeFormDataBody(draftFormData())
        : bodyMode() === 'file'
          ? serializeFileBody(draftFilePath())
          : draftBody();

    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      setSaveError('Clipboard is unavailable in this environment.');
      return;
    }

    try {
      await navigator.clipboard.writeText(bodyText);
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
    if (!isDirty()) {
      return;
    }

    if (!request) {
      setSaveError('Select a request before saving body edits.');
      return;
    }

    if (currentContent === undefined) {
      setSaveError('Request file content is still loading. Try saving again.');
      return;
    }

    let nextSerializedBody = '';
    if (sourceBody.kind === 'inline') {
      if (!isJsonBody()) {
        setSaveError(UNAVAILABLE_BODY_EDITING_ERROR);
        return;
      }

      const nextValidationError = validateJsonBodyText(draftBody());
      if (nextValidationError) {
        setValidationError(nextValidationError);
        setSaveError(INVALID_JSON_SAVE_ERROR);
        return;
      }
      nextSerializedBody = draftBody();
    } else if (sourceBody.kind === 'form-data') {
      nextSerializedBody = serializeFormDataBody(draftFormData());
    } else if (sourceBody.kind === 'file') {
      const nextPath = normalizeFileReferenceInput(draftFilePath());
      if (!nextPath) {
        setSaveError(EMPTY_FILE_PATH_ERROR);
        return;
      }
      nextSerializedBody = serializeFileBody(nextPath);
    } else {
      setSaveError(UNAVAILABLE_BODY_EDITING_ERROR);
      return;
    }

    const bodySpan = sourceBody.spans?.body;
    if (!bodySpan) {
      setSaveError(MISSING_BODY_SPAN_ERROR);
      return;
    }

    const rewrite = applySpanEditToContent(currentContent, bodySpan, nextSerializedBody);
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
    bodyMode,
    draftBody,
    draftFormData,
    draftFilePath,
    isJsonBody,
    templateWarnings,
    validationError,
    isDirty,
    isSaving,
    saveError,
    onBodyChange,
    onFilePathChange,
    onFormDataNameChange,
    onFormDataTypeChange,
    onFormDataValueChange,
    onFormDataFilenameChange,
    onAddFormDataField,
    onRemoveFormDataField,
    onBodyPrettify,
    onBodyMinify,
    onBodyCopy,
    onDiscard,
    onSave
  };
}
