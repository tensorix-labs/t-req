import type { JSX } from 'solid-js';
import { useDialog, type DialogContextValue } from '../context/dialog';
import { useExit } from '../context/exit';
import { useKeybind } from '../context/keybind';
import { DebugConsoleDialog } from './debug-console-dialog';
import { DialogSelect, type DialogSelectOption } from './dialog-select';

export type Command = {
  title: string;
  value: string;
  keybind?: string;
  onSelect: (dialog: DialogContextValue) => void;
};

export function CommandDialog(): JSX.Element {
  const dialog = useDialog();
  const exit = useExit();
  const keybind = useKeybind();

  const commands: Command[] = [
    {
      title: 'Debug Console',
      value: 'debug_console',
      keybind: keybind.print('debug_console'),
      onSelect: (d) => d.replace(() => <DebugConsoleDialog />)
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
