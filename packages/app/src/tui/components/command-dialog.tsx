import type { JSX } from 'solid-js';
import { useDialog, type DialogContextValue } from '../context/dialog';
import { useExit } from '../context/exit';
import { useKeybind } from '../context/keybind';
import type { UpdateContextValue } from '../context/update';
import { Installation } from '../../installation';
import { theme, rgba } from '../theme';
import { DebugConsoleDialog } from './debug-console-dialog';
import { DialogSelect, type DialogSelectOption } from './dialog-select';
import { FileRequestPicker } from './file-request-picker';

export type Command = {
  title: string;
  value: string;
  keybind?: string;
  onSelect: (dialog: DialogContextValue) => void;
};

export interface CommandDialogProps {
  update: UpdateContextValue;
}

export function CommandDialog(props: CommandDialogProps): JSX.Element {
  const dialog = useDialog();
  const exit = useExit();
  const keybind = useKeybind();

  const commands: Command[] = [
    ...(props.update.updateAvailable()
      ? [
          {
            title: `Update Available (v${props.update.updateInfo()?.version})`,
            value: 'check_update',
            onSelect: (d: DialogContextValue) => {
              const info = props.update.updateInfo();
              if (info) {
                d.replace(() => (
                  <box flexDirection="column" padding={1}>
                    <text fg={rgba(theme.text)} attributes={1}>
                      Update Available
                    </text>
                    <text fg={rgba(theme.textMuted)}>
                      {`v${Installation.VERSION} -> v${info.version}`}
                    </text>
                    <text fg={rgba(theme.text)} marginTop={1}>
                      Run:
                    </text>
                    <text fg={rgba(theme.primary)}>{info.command}</text>
                  </box>
                ));
              }
            }
          }
        ]
      : []),
    {
      title: 'Debug Console',
      value: 'debug_console',
      keybind: keybind.print('debug_console'),
      onSelect: (d) => d.replace(() => <DebugConsoleDialog />)
    },
    {
      title: 'View Workspace Tree',
      value: 'workspace_tree',
      keybind: keybind.print('file_picker'),
      onSelect: (d) => d.replace(() => <FileRequestPicker />)
    },
    {
      title: 'Exit',
      value: 'exit',
      keybind: keybind.print('quit'),
      onSelect: () => exit()
    }
  ];

  const handleSelect = (opt: DialogSelectOption<string>) => {
    const cmd = commands.find((c) => c.value === opt.value);
    if (cmd) {
      cmd.onSelect(dialog);
    }
  };

  return (
    <DialogSelect
      title="Commands"
      placeholder="Type a command..."
      options={commands}
      onSelect={handleSelect}
    />
  );
}
