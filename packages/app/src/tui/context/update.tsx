import { createContext, useContext, onMount, type ParentProps } from 'solid-js';
import { createSignal } from 'solid-js';
import { Installation } from '../../installation';
import { useToast } from '../components/toast';

export interface UpdateInfo {
  version: string;
  method: Installation.Method;
  command: string;
}

export interface UpdateContextValue {
  updateInfo: () => UpdateInfo | null;
  updateAvailable: () => boolean;
}

const UpdateContext = createContext<UpdateContextValue>();

export function UpdateProvider(props: ParentProps) {
  const toast = useToast();
  const [updateInfo, setUpdateInfo] = createSignal<UpdateInfo | null>(null);
  const updateAvailable = () => updateInfo() !== null;

  onMount(() => {
    void checkForUpdate();
  });

  async function checkForUpdate() {
    try {
      const method = await Installation.method();
      const latestVersion = await Installation.latest(method);
      if (!latestVersion) return;
      if (Installation.VERSION === latestVersion) return;

      const command = Installation.updateCommand(method, latestVersion);
      setUpdateInfo({ version: latestVersion, method, command });

      toast.show({
        variant: 'info',
        title: 'Update Available',
        message: `v${Installation.VERSION} -> v${latestVersion}\nRun: ${command}`,
        duration: 3000
      });
    } catch {
      // Silently fail - network errors, offline, etc.
    }
  }

  const value: UpdateContextValue = {
    updateInfo,
    updateAvailable
  };

  return <UpdateContext.Provider value={value}>{props.children}</UpdateContext.Provider>;
}

export function useUpdate(): UpdateContextValue {
  const ctx = useContext(UpdateContext);
  if (!ctx) throw new Error('useUpdate must be used within an UpdateProvider');
  return ctx;
}
