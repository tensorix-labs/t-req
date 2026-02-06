import type { ConnectionStatus } from '../store';
import type { StreamConnectionStatus } from '../stream';
import { theme } from '../theme';

export interface StatusDisplay {
  icon: string;
  text: string;
  color: string;
}

export function getStatusDisplay(status: ConnectionStatus): StatusDisplay {
  switch (status) {
    case 'connected':
      return { icon: '\u25CF', text: 'connected', color: theme.success };
    case 'connecting':
      return { icon: '\u25CB', text: 'connecting', color: theme.warning };
    case 'error':
      return { icon: '\u2717', text: 'error', color: theme.error };
  }
}

export function getStreamStatusDisplay(status: StreamConnectionStatus): StatusDisplay {
  switch (status) {
    case 'connected':
      return { icon: '\u25CF', text: 'Connected', color: theme.success };
    case 'connecting':
      return { icon: '\u25CB', text: 'Connecting...', color: theme.warning };
    case 'error':
      return { icon: '\u2717', text: 'Error', color: theme.error };
    case 'disconnected':
      return { icon: '\u25CB', text: 'Disconnected', color: theme.textMuted };
  }
}
