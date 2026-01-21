import type { ConnectionStatus } from '../store';
import { theme, rgba } from '../theme';
import { getStatusDisplay } from '../util/status-display';

export interface HeaderProps {
  connectionStatus: ConnectionStatus;
  error?: string;
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
    >
      <text fg={rgba(theme.text)}>t-req 🦖</text>
      <box flexDirection="row" gap={1}>
        <text fg={rgba(status().color)}>{status().icon}</text>
        <text fg={rgba(theme.textMuted)}>{status().text}</text>
      </box>
    </box>
  );
}
