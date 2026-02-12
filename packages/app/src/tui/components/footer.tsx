import { Installation } from '../../installation';
import { rgba, theme } from '../theme';

export interface FooterProps {
  workspacePath: string;
}

export function Footer(props: FooterProps) {
  // Format workspace path: use ~ for home directory if applicable
  const displayPath = () => {
    const home = process.env.HOME || process.env.USERPROFILE || '';
    if (home && props.workspacePath.startsWith(home)) {
      return `~${props.workspacePath.slice(home.length)}`;
    }
    return props.workspacePath || '(no workspace)';
  };

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
      <text fg={rgba(theme.textMuted)}>{displayPath()}</text>
      <text fg={rgba(theme.textMuted)}>v{Installation.VERSION}</text>
    </box>
  );
}
