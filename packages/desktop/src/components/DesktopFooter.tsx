import {
  type AppFooterStatusTone,
  getAppFooterActionsClasses,
  getAppFooterClasses,
  getAppFooterInnerClasses,
  getAppFooterPrimaryClasses,
  getAppFooterStatusClasses,
  getAppFooterWorkspaceClasses,
  getIconActionButtonClasses
} from '@t-req/ui';
import { createMemo } from 'solid-js';
import type { ServerStatus } from '../context/server-context';

type DesktopFooterProps = {
  status: ServerStatus;
  workspacePath: string | null;
  canOpenSettings: boolean;
  onOpenSettings: () => void;
};

function mapStatusLabel(status: ServerStatus): string {
  switch (status.state) {
    case 'ready':
      return 'Ready';
    case 'connecting':
      return 'Connecting';
    case 'picking-workspace':
      return 'Select Workspace';
    case 'switching':
      return 'Switching';
    case 'error':
      return 'Error';
    default:
      return 'Idle';
  }
}

function mapStatusTone(status: ServerStatus): AppFooterStatusTone {
  switch (status.state) {
    case 'ready':
      return 'ready';
    case 'connecting':
    case 'picking-workspace':
    case 'switching':
      return 'progress';
    case 'error':
      return 'error';
    default:
      return 'idle';
  }
}

function SettingsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M7.62516 4.46094L5.05225 3.86719L3.86475 5.05469L4.4585 7.6276L2.0835 9.21094V10.7943L4.4585 12.3776L3.86475 14.9505L5.05225 16.138L7.62516 15.5443L9.2085 17.9193H10.7918L12.3752 15.5443L14.9481 16.138L16.1356 14.9505L15.5418 12.3776L17.9168 10.7943V9.21094L15.5418 7.6276L16.1356 5.05469L14.9481 3.86719L12.3752 4.46094L10.7918 2.08594H9.2085L7.62516 4.46094Z"
        stroke="currentColor"
      />
      <path
        d="M12.5002 10.0026C12.5002 11.3833 11.3809 12.5026 10.0002 12.5026C8.61945 12.5026 7.50016 11.3833 7.50016 10.0026C7.50016 8.62189 8.61945 7.5026 10.0002 7.5026C11.3809 7.5026 12.5002 8.62189 12.5002 10.0026Z"
        stroke="currentColor"
      />
    </svg>
  );
}

export default function DesktopFooter(props: DesktopFooterProps) {
  const statusLabel = createMemo(() => mapStatusLabel(props.status));
  const statusTone = createMemo(() => mapStatusTone(props.status));
  const workspaceLabel = createMemo(() => {
    if (props.workspacePath) {
      return props.workspacePath;
    }

    switch (props.status.state) {
      case 'picking-workspace':
        return 'No workspace selected';
      case 'error':
        return 'Workspace unavailable';
      default:
        return 'Waiting for workspace';
    }
  });

  return (
    <footer class={getAppFooterClasses()}>
      <div class={getAppFooterInnerClasses()}>
        <div class={getAppFooterPrimaryClasses()}>
          <span class={getAppFooterStatusClasses(statusTone())}>{statusLabel()}</span>
          <span class={getAppFooterWorkspaceClasses()} title={workspaceLabel()}>
            {workspaceLabel()}
          </span>
        </div>
        <div class={getAppFooterActionsClasses()}>
          <button
            type="button"
            class={getIconActionButtonClasses({ disabled: !props.canOpenSettings })}
            onClick={props.onOpenSettings}
            disabled={!props.canOpenSettings}
            aria-label="Open settings"
            title="Open settings"
          >
            <SettingsIcon />
          </button>
        </div>
      </div>
    </footer>
  );
}
