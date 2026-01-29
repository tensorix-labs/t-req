import type { JSX } from 'solid-js';
import { useDialog } from '../context/dialog';
import { useStore } from '../context/store';
import { DialogSelect, type DialogSelectOption } from './dialog-select';

/**
 * Profile selection dialog.
 * Allows switching between available profiles defined in treq.jsonc.
 */
export function ProfileSelectDialog(): JSX.Element {
  const dialog = useDialog();
  const store = useStore();

  const options = (): DialogSelectOption<string | undefined>[] => {
    const profiles = store.availableProfiles();
    const currentProfile = store.activeProfile();

    const noneOption: DialogSelectOption<string | undefined> = {
      title: currentProfile === undefined ? 'None (default) *' : 'None (default)',
      value: undefined,
      description: 'Use base configuration without any profile'
    };

    const profileOptions: DialogSelectOption<string | undefined>[] = profiles.map((name) => ({
      title: name === currentProfile ? `${name} *` : name,
      value: name,
      description: `Switch to ${name} profile`
    }));

    return [noneOption, ...profileOptions];
  };

  const handleSelect = (opt: DialogSelectOption<string | undefined>) => {
    store.setActiveProfile(opt.value);
    dialog.clear();
  };

  return (
    <DialogSelect
      title="Select Profile"
      placeholder="Type to filter profiles..."
      options={options()}
      onSelect={handleSelect}
    />
  );
}
