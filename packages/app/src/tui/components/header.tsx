import type { ConnectionStatus } from '../store';
import { theme, rgba } from '../theme';

export interface HeaderProps {
  serverUrl: string;
  connectionStatus: ConnectionStatus;
  error?: string;
}

function getStatusDisplay(status: ConnectionStatus): { icon: string; text: string; color: string } {
  switch (status) {
    case 'connected':
      return { icon: '\u25CF', text: 'connected', color: theme.success };
    case 'connecting':
      return { icon: '\u25CB', text: 'connecting', color: theme.warning };
    case 'error':
      return { icon: '\u2717', text: 'error', color: theme.error };
  }
}

export function Header(props: HeaderProps) {
  const status = () => getStatusDisplay(props.connectionStatus);

  return (
    <box
      height={1}
      paddingLeft={2}
      paddingRight={2}
      flexDirection="row"
      justifyContent="space-between"
      alignItems="center"
      backgroundColor={rgba(theme.background)}
    >
      <text fg={rgba(theme.textMuted)}>{props.serverUrl}</text>
      <box flexDirection="row" gap={1}>
        <text fg={rgba(status().color)}>{status().icon}</text>
        <text fg={rgba(theme.textMuted)}>{status().text}</text>
      </box>
    </box>
  );
}
