import type { RequestDetailsRow } from '../../../../utils/request-details';
import { DraftHeader, ErrorBanner, KeyValueTable } from '../shared';

interface HeadersPanelProps {
  hasRequest: boolean;
  requestHeaders: RequestDetailsRow[];
  headerDraftDirty: boolean;
  headerDraftSaving: boolean;
  headerDraftSaveError?: string;
  onHeaderChange: (index: number, field: 'key' | 'value', value: string) => void;
  onAddHeader: () => void;
  onRemoveHeader: (index: number) => void;
  onSaveHeaders: () => void;
  onDiscardHeaders: () => void;
}

export function HeadersPanel(props: HeadersPanelProps) {
  return (
    <div class="space-y-2">
      <ErrorBanner message={props.headerDraftSaveError} />

      <DraftHeader
        itemLabel="Header"
        hasRequest={props.hasRequest}
        draftDirty={props.headerDraftDirty}
        draftSaving={props.headerDraftSaving}
        onAdd={props.onAddHeader}
        onSave={props.onSaveHeaders}
        onDiscard={props.onDiscardHeaders}
      />

      <KeyValueTable
        items={props.requestHeaders}
        hasRequest={props.hasRequest}
        isSaving={props.headerDraftSaving}
        emptyMessage="No headers configured for this request."
        onChange={props.onHeaderChange}
        onRemove={props.onRemoveHeader}
      />
    </div>
  );
}
