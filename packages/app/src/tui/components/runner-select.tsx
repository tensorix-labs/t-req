import type { JSX } from 'solid-js';
import { useDialog } from '../context/dialog';
import { DialogSelect, type DialogSelectOption } from './dialog-select';
import { getRunnerOptions, type RunnerConfig } from '../runner';

export interface RunnerSelectProps {
  scriptPath: string;
  onSelect: (runner: RunnerConfig) => void;
}

/**
 * Dialog for selecting a TypeScript runner when auto-detection fails.
 */
export function RunnerSelectDialog(props: RunnerSelectProps): JSX.Element {
  const dialog = useDialog();

  const options: DialogSelectOption<RunnerConfig>[] = getRunnerOptions().map((opt) => ({
    title: opt.label,
    value: opt.runner,
    description: `Run with ${opt.label}`
  }));

  const handleSelect = (opt: DialogSelectOption<RunnerConfig>) => {
    dialog.clear();
    props.onSelect(opt.value);
  };

  // Get script filename for display
  const scriptName = () => {
    const parts = props.scriptPath.split('/');
    return parts[parts.length - 1] ?? props.scriptPath;
  };

  return (
    <DialogSelect
      title={`Select runner for ${scriptName()}`}
      placeholder="Choose a TypeScript runner..."
      options={options}
      onSelect={handleSelect}
    />
  );
}
