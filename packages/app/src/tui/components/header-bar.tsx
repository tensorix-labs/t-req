import { useStore } from '../context';
import { rgba, theme } from '../theme';
import { getStatusDisplay } from '../util/status-display';

export function HeaderBar() {
  const store = useStore();
  const statusDisplay = () => getStatusDisplay(store.connectionStatus());
  return (
    <box
      height={2}
      flexShrink={0}
      flexDirection="column"
      backgroundColor={rgba(theme.backgroundPanel)}
    >
      <box
        height={1}
        paddingLeft={2}
        paddingRight={2}
        flexDirection="row"
        justifyContent="space-between"
      >
        <text fg={rgba(theme.text)}>t-req</text>
        <box flexDirection="row" gap={1}>
          <text fg={rgba(statusDisplay().color)}>{statusDisplay().icon}</text>
          <text fg={rgba(theme.textMuted)}>{statusDisplay().text}</text>
        </box>
      </box>
    </box>
  );
}
