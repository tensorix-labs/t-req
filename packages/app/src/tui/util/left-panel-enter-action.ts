export type LeftPanelTabId = 'files' | 'executions';

export type LeftPanelEnterAction = 'none' | 'toggle-directory' | 'execute-file';

export function resolveLeftPanelEnterAction(
  activeTab: LeftPanelTabId,
  selectedIsDirectory: boolean | undefined
): LeftPanelEnterAction {
  if (activeTab !== 'files') {
    return 'none';
  }

  if (selectedIsDirectory === undefined) {
    return 'none';
  }

  return selectedIsDirectory ? 'toggle-directory' : 'execute-file';
}
