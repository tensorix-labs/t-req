import type { TestFrameworkOption } from '@t-req/sdk/client';
import type { JSX } from 'solid-js';
import { useDialog } from '../context/dialog';
import { extractFilename } from '../util/path';
import { DialogSelect, type DialogSelectOption } from './dialog-select';

export interface FrameworkSelectProps {
  testPath: string;
  options: TestFrameworkOption[];
  onSelect: (frameworkId: string) => void;
}

export function FrameworkSelectDialog(props: FrameworkSelectProps): JSX.Element {
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

  const testName = () => extractFilename(props.testPath, props.testPath);

  return (
    <DialogSelect
      title={`Select framework for ${testName()}`}
      placeholder="Choose a test framework..."
      options={options}
      onSelect={handleSelect}
    />
  );
}
