import type { LeftPanelTab } from '../components/tabbed-panel';

export type LeftPanelEnterAction = 'none' | 'toggle-directory' | 'execute-file';

export function resolveLeftPanelEnterAction(
  activeTab: LeftPanelTab,
  selectedIsDirectory: boolean | undefined
): LeftPanelEnterAction {
  switch (activeTab) {
    case 'executions':
      return 'none';
    case 'files':
      if (selectedIsDirectory === undefined) {
        return 'none';
      }

      return selectedIsDirectory ? 'toggle-directory' : 'execute-file';
  }
}
