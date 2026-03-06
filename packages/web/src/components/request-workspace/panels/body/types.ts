import type { RequestBodyField, RequestBodySummary } from '../../../../utils/request-details';

export interface BodyPanelProps {
  hasRequest: boolean;
  requestBodySummary: RequestBodySummary;
  requestBodyDraft: string;
  requestBodyFormDataDraft: RequestBodyField[];
  requestBodyFilePathDraft: string;
  bodyDraftDirty: boolean;
  bodyDraftSaving: boolean;
  bodyDraftSaveError?: string;
  bodyDraftValidationError?: string;
  bodyDraftIsJsonEditable: boolean;
  bodyDraftTemplateWarnings: string[];
  onBodyChange: (value: string) => void;
  onBodyFilePathChange: (value: string) => void;
  onBodyFormDataNameChange: (index: number, value: string) => void;
  onBodyFormDataTypeChange: (index: number, isFile: boolean) => void;
  onBodyFormDataValueChange: (index: number, value: string) => void;
  onBodyFormDataFilenameChange: (index: number, value: string) => void;
  onBodyFormDataAddField: () => void;
  onBodyFormDataRemoveField: (index: number) => void;
  onBodyPrettify: () => void;
  onBodyMinify: () => void;
  onBodyCopy: () => void;
  onSaveBody: () => void;
  onDiscardBody: () => void;
}

export interface InlineBodyEditorProps {
  hasRequest: boolean;
  requestBodyDraft: string;
  requestBodySummary: RequestBodySummary;
  bodyDraftDirty: boolean;
  bodyDraftSaving: boolean;
  bodyDraftValidationError?: string;
  bodyDraftIsJsonEditable: boolean;
  bodyDraftTemplateWarnings: string[];
  onBodyChange: (value: string) => void;
  onBodyPrettify: () => void;
  onBodyMinify: () => void;
  onBodyCopy: () => void;
  onSaveBody: () => void;
  onDiscardBody: () => void;
}

export interface FormDataEditorProps {
  hasRequest: boolean;
  requestBodyFormDataDraft: RequestBodyField[];
  bodyDraftDirty: boolean;
  bodyDraftSaving: boolean;
  onBodyFormDataNameChange: (index: number, value: string) => void;
  onBodyFormDataTypeChange: (index: number, isFile: boolean) => void;
  onBodyFormDataValueChange: (index: number, value: string) => void;
  onBodyFormDataFilenameChange: (index: number, value: string) => void;
  onBodyFormDataAddField: () => void;
  onBodyFormDataRemoveField: (index: number) => void;
  onSaveBody: () => void;
  onDiscardBody: () => void;
}

export interface FileBodyEditorProps {
  hasRequest: boolean;
  requestBodyFilePathDraft: string;
  bodyDraftDirty: boolean;
  bodyDraftSaving: boolean;
  onBodyFilePathChange: (value: string) => void;
  onBodyCopy: () => void;
  onSaveBody: () => void;
  onDiscardBody: () => void;
}
