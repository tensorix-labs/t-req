import { createContext, createSignal, onMount, type ParentProps, useContext } from 'solid-js';
import type { UpdateInfo } from '../../update';
import { runAutoUpdate } from '../../update';
import { useToast } from '../components/toast';

export type { UpdateInfo } from '../../update';

export interface UpdateContextValue {
  updateInfo: () => UpdateInfo | null;
  updateAvailable: () => boolean;
}

const UpdateContext = createContext<UpdateContextValue>();

export interface UpdateProviderProps extends ParentProps {
  autoUpdateEnabled?: boolean;
}

export function UpdateProvider(props: UpdateProviderProps) {
  const toast = useToast();
  const [updateInfo, setUpdateInfo] = createSignal<UpdateInfo | null>(null);
  const updateAvailable = () => updateInfo() !== null;

  onMount(() => {
    void checkForUpdate();
  });

  async function checkForUpdate() {
    const outcome = await runAutoUpdate({
      enabled: props.autoUpdateEnabled ?? true,
      interactive: process.stdout.isTTY === true
    });

    switch (outcome.status) {
      case 'available_manual': {
        setUpdateInfo({
          version: outcome.latestVersion,
          method: outcome.method,
          command: outcome.command
        });
        toast.show({
          variant: 'info',
          title: 'Update Available',
          message: `v${outcome.currentVersion} -> v${outcome.latestVersion}\nRun: ${outcome.command}`,
          duration: 3000
        });
        return;
      }

      case 'backoff_skipped': {
        setUpdateInfo({
          version: outcome.latestVersion,
          method: outcome.method,
          command: outcome.command
        });
        toast.show({
          variant: 'warning',
          title: 'Update Available',
          message: `Auto-update paused after a recent failure.\nRun: ${outcome.command}`,
          duration: 4000
        });
        return;
      }

      case 'updated': {
        toast.show({
          variant: 'success',
          title: 'Updated',
          message: `Installed v${outcome.latestVersion}. It will apply on your next run.`,
          duration: 3500
        });
        return;
      }

      case 'failed': {
        if (
          outcome.phase === 'upgrade' &&
          outcome.latestVersion &&
          outcome.method &&
          outcome.command
        ) {
          setUpdateInfo({
            version: outcome.latestVersion,
            method: outcome.method,
            command: outcome.command
          });
          toast.show({
            variant: 'warning',
            title: 'Auto-update failed',
            message: `Run manually: ${outcome.command}`,
            duration: 4000
          });
        }
        return;
      }

      default:
        return;
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
