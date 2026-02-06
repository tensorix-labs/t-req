import type { JSX } from 'solid-js';
import { useDialog } from '../context/dialog';
import { DialogSelect, type DialogSelectOption } from './dialog-select';
import type { RunnerOption } from '../sdk';
import { extractFilename } from '../util/path';

export interface RunnerSelectProps {
  scriptPath: string;
  options: RunnerOption[];
  onSelect: (runnerId: string) => void;
}

/**
 * Dialog for selecting a script runner when auto-detection fails.
 * Receives options from the server and returns the selected runner ID.
 */
export function RunnerSelectDialog(props: RunnerSelectProps): JSX.Element {
  const dialog = useDialog();

  const options: DialogSelectOption<string>[] = props.options.map((opt) => ({
    title: opt.label,
    value: opt.id,
    description: `Run with ${opt.label}`
  }));

  const handleSelect = (opt: DialogSelectOption<string>) => {
    dialog.clear();
    props.onSelect(opt.value);
  };

  const scriptName = () => extractFilename(props.scriptPath, props.scriptPath);

  return (
    <DialogSelect
      title={`Select runner for ${scriptName()}`}
      placeholder="Choose a script runner..."
      options={options}
      onSelect={handleSelect}
    />
  );
}
