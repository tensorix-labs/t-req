import { type Accessor, createEffect, createSignal, on } from 'solid-js';
import { toErrorMessage } from '../../lib/errors';
import {
  type RequestBodyField,
  type RequestBodySummary,
  type RequestDetailsRow,
  toRequestParams
} from './utils/request-details';
import {
  applyRequestEditsToContent,
  applySpanEditToContent,
  buildUrlWithParams,
  cloneRequestRows,
  insertRequestBodyIntoContent
} from './utils/request-editing';
import { cloneFormDataFields, serializeFormDataBody } from './utils/request-form-data';

export type RequestBodyDraftMode = 'none' | 'inline' | 'form-data' | 'file';

type UseRequestDraftControllerInput = {
  requestDraftKey: Accessor<string | undefined>;
  requestSourceUrl: Accessor<string | undefined>;
  requestSourceParams: Accessor<RequestDetailsRow[]>;
  requestSourceHeaders: Accessor<RequestDetailsRow[]>;
  requestSourceBody: Accessor<RequestBodySummary>;
  requestSourceFormData: Accessor<RequestBodyField[]>;
  selectedRequest: Accessor<{ index: number } | undefined>;
  getFileDraftContent: () => string | undefined;
  setFileDraftContent: (content: string) => void;
  saveSelectedFile: () => Promise<unknown>;
  refetchParsedRequestFile: () => Promise<unknown> | unknown;
};

const toDraftBodyMode = (kind: 'none' | 'inline' | 'form-data' | 'file'): RequestBodyDraftMode =>
  kind;

export function useRequestDraftController(input: UseRequestDraftControllerInput) {
  const [draftRequestKey, setDraftRequestKey] = createSignal<string | undefined>(undefined);
  const [draftUrl, setDraftUrl] = createSignal('');
  const [draftParams, setDraftParams] = createSignal<RequestDetailsRow[]>([]);
  const [draftHeaders, setDraftHeaders] = createSignal<RequestDetailsRow[]>([]);
  const [draftBodyMode, setDraftBodyMode] = createSignal<RequestBodyDraftMode>('none');
  const [draftBody, setDraftBody] = createSignal('');
  const [draftFormData, setDraftFormData] = createSignal<RequestBodyField[]>([]);
  const [isDetailsDirty, setIsDetailsDirty] = createSignal(false);
  const [detailsSaveError, setDetailsSaveError] = createSignal<string | undefined>(undefined);

  createEffect(
    on(input.requestDraftKey, (nextKey, previousKey) => {
      if (!nextKey) {
        setDraftRequestKey(undefined);
        setDraftUrl('');
        setDraftParams([]);
        setDraftHeaders([]);
        setDraftBodyMode('none');
        setDraftBody('');
        setDraftFormData([]);
        setIsDetailsDirty(false);
        setDetailsSaveError(undefined);
        return;
      }

      if (nextKey === previousKey) {
        return;
      }

      setDraftRequestKey(nextKey);
      setDraftUrl(input.requestSourceUrl() ?? '');
      setDraftParams(cloneRequestRows(input.requestSourceParams()));
      setDraftHeaders(cloneRequestRows(input.requestSourceHeaders()));
      setDraftBodyMode(toDraftBodyMode(input.requestSourceBody().kind));
      setDraftBody(input.requestSourceBody().text ?? '');
      setDraftFormData(cloneFormDataFields(input.requestSourceFormData()));
      setIsDetailsDirty(false);
      setDetailsSaveError(undefined);
    })
  );

  createEffect(
    on(
      [
        input.requestDraftKey,
        input.requestSourceUrl,
        input.requestSourceParams,
        input.requestSourceHeaders,
        input.requestSourceBody,
        input.requestSourceFormData
      ],
      ([nextKey, nextUrl, nextParams, nextHeaders, nextBody, nextFormData]) => {
        if (!nextKey || draftRequestKey() !== nextKey || isDetailsDirty()) {
          return;
        }

        setDraftUrl(nextUrl ?? '');
        setDraftParams(cloneRequestRows(nextParams));
        setDraftHeaders(cloneRequestRows(nextHeaders));
        setDraftBodyMode(toDraftBodyMode(nextBody.kind));
        setDraftBody(nextBody.text ?? '');
        setDraftFormData(cloneFormDataFields(nextFormData));
      }
    )
  );

  const updateDraftRows = (
    rows: RequestDetailsRow[],
    index: number,
    field: 'key' | 'value',
    value: string
  ): RequestDetailsRow[] => {
    if (index < 0 || index >= rows.length) {
      return rows;
    }

    return rows.map((row, rowIndex) => {
      if (rowIndex !== index) {
        return row;
      }
      return {
        ...row,
        [field]: value
      };
    });
  };

  const markDetailsDirty = () => {
    setIsDetailsDirty(true);
    setDetailsSaveError(undefined);
  };

  const setDraftParamsAndSyncUrl = (nextParams: RequestDetailsRow[]) => {
    setDraftParams(nextParams);
    setDraftUrl((currentUrl) => buildUrlWithParams(currentUrl, nextParams));
  };

  const handleDraftUrlChange = (nextUrl: string) => {
    setDraftUrl(nextUrl);
    setDraftParams(toRequestParams(nextUrl));
    markDetailsDirty();
  };

  const handleDraftParamChange = (index: number, field: 'key' | 'value', value: string) => {
    const nextRows = updateDraftRows(draftParams(), index, field, value);
    setDraftParamsAndSyncUrl(nextRows);
    markDetailsDirty();
  };

  const handleDraftHeaderChange = (index: number, field: 'key' | 'value', value: string) => {
    setDraftHeaders((rows) => updateDraftRows(rows, index, field, value));
    markDetailsDirty();
  };

  const handleDraftBodyChange = (value: string) => {
    setDraftBody(value);
    markDetailsDirty();
  };

  const handleDraftBodyModeChange = (nextMode: RequestBodyDraftMode) => {
    if (nextMode === draftBodyMode()) {
      return;
    }

    setDraftBodyMode(nextMode);
    if (nextMode === 'form-data' && draftFormData().length === 0) {
      setDraftFormData([{ name: '', value: '', isFile: false }]);
    }
    markDetailsDirty();
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

  const handleDraftFormDataNameChange = (index: number, value: string) => {
    setDraftFormData((fields) =>
      updateDraftFormDataRows(fields, index, (field) => ({
        ...field,
        name: value
      }))
    );
    markDetailsDirty();
  };

  const handleDraftFormDataTypeChange = (index: number, isFile: boolean) => {
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
    markDetailsDirty();
  };

  const handleDraftFormDataValueChange = (index: number, value: string) => {
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
    markDetailsDirty();
  };

  const handleDraftFormDataFilenameChange = (index: number, value: string) => {
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
    markDetailsDirty();
  };

  const addDraftFormDataField = () => {
    setDraftFormData((fields) => [...fields, { name: '', value: '', isFile: false }]);
    markDetailsDirty();
  };

  const removeDraftFormDataField = (index: number) => {
    setDraftFormData((fields) => fields.filter((_, fieldIndex) => fieldIndex !== index));
    markDetailsDirty();
  };

  const addDraftParam = () => {
    const nextRows = [...draftParams(), { key: '', value: '' }];
    setDraftParamsAndSyncUrl(nextRows);
    markDetailsDirty();
  };

  const removeDraftParam = (index: number) => {
    const nextRows = draftParams().filter((_, rowIndex) => rowIndex !== index);
    setDraftParamsAndSyncUrl(nextRows);
    markDetailsDirty();
  };

  const addDraftHeader = () => {
    setDraftHeaders((rows) => [...rows, { key: '', value: '' }]);
    markDetailsDirty();
  };

  const removeDraftHeader = (index: number) => {
    setDraftHeaders((rows) => rows.filter((_, rowIndex) => rowIndex !== index));
    markDetailsDirty();
  };

  const discardRequestDetailsDraft = () => {
    setDraftUrl(input.requestSourceUrl() ?? '');
    setDraftParams(cloneRequestRows(input.requestSourceParams()));
    setDraftHeaders(cloneRequestRows(input.requestSourceHeaders()));
    setDraftBodyMode(toDraftBodyMode(input.requestSourceBody().kind));
    setDraftBody(input.requestSourceBody().text ?? '');
    setDraftFormData(cloneFormDataFields(input.requestSourceFormData()));
    setIsDetailsDirty(false);
    setDetailsSaveError(undefined);
  };

  const saveRequestDetailsDraft = async () => {
    const request = input.selectedRequest();
    const content = input.getFileDraftContent();
    if (!request) {
      setDetailsSaveError('Select a request before saving request details.');
      return;
    }
    if (content === undefined) {
      setDetailsSaveError('Request file content is still loading. Try saving again.');
      return;
    }

    const nextUrl = draftUrl().trim();
    if (!nextUrl) {
      setDetailsSaveError('Request URL cannot be empty.');
      return;
    }

    const sourceBody = input.requestSourceBody();
    const sourceBodyText = sourceBody.kind === 'inline' ? (sourceBody.text ?? '') : '';
    const sourceFormData = sourceBody.kind === 'form-data' ? (sourceBody.fields ?? []) : [];
    const sourceFileBodyText = sourceBody.kind === 'file' ? `< ${sourceBody.filePath ?? ''}` : '';
    const sourceBodyMode = toDraftBodyMode(sourceBody.kind);
    const sourceSerializedBody =
      sourceBodyMode === 'inline'
        ? sourceBodyText
        : sourceBodyMode === 'form-data'
          ? serializeFormDataBody(sourceFormData)
          : sourceBodyMode === 'file'
            ? sourceFileBodyText
            : '';
    const nextBodyMode = draftBodyMode();
    const nextSerializedBody =
      nextBodyMode === 'inline'
        ? draftBody()
        : nextBodyMode === 'form-data'
          ? serializeFormDataBody(draftFormData())
          : nextBodyMode === 'file'
            ? sourceFileBodyText
            : '';
    const shouldRewriteBody =
      nextBodyMode !== sourceBodyMode || nextSerializedBody !== sourceSerializedBody;

    let contentWithBody = content;
    if (shouldRewriteBody && sourceBody.spans?.body) {
      const bodySpan = sourceBody.spans?.body;
      if (!bodySpan) {
        setDetailsSaveError('Unable to update body text because body span data was unavailable.');
        return;
      }

      const bodyRewrite = applySpanEditToContent(contentWithBody, bodySpan, nextSerializedBody);
      if (!bodyRewrite.ok) {
        setDetailsSaveError(bodyRewrite.error);
        return;
      }
      contentWithBody = bodyRewrite.content;
    }
    if (shouldRewriteBody && !sourceBody.spans?.body && nextSerializedBody.length > 0) {
      const bodyInsert = insertRequestBodyIntoContent(
        contentWithBody,
        request.index,
        nextSerializedBody
      );
      if (!bodyInsert.ok) {
        setDetailsSaveError(bodyInsert.error);
        return;
      }
      contentWithBody = bodyInsert.content;
    }

    const updatedContent = applyRequestEditsToContent(
      contentWithBody,
      request.index,
      nextUrl,
      draftHeaders()
    );
    if (!updatedContent.ok) {
      setDetailsSaveError(updatedContent.error);
      return;
    }

    input.setFileDraftContent(updatedContent.content);
    setDetailsSaveError(undefined);
    try {
      await input.saveSelectedFile();
      setIsDetailsDirty(false);
      await input.refetchParsedRequestFile();
    } catch (error) {
      setDetailsSaveError(toErrorMessage(error));
    }
  };

  return {
    draftRequestKey,
    draftUrl,
    draftParams,
    draftHeaders,
    draftBodyMode,
    draftBody,
    draftFormData,
    isDetailsDirty,
    detailsSaveError,
    handleDraftUrlChange,
    handleDraftParamChange,
    handleDraftHeaderChange,
    handleDraftBodyChange,
    handleDraftBodyModeChange,
    handleDraftFormDataNameChange,
    handleDraftFormDataTypeChange,
    handleDraftFormDataValueChange,
    handleDraftFormDataFilenameChange,
    addDraftFormDataField,
    removeDraftFormDataField,
    addDraftParam,
    removeDraftParam,
    addDraftHeader,
    removeDraftHeader,
    discardRequestDetailsDraft,
    saveRequestDetailsDraft
  };
}
