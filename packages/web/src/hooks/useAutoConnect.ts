import { onMount } from 'solid-js';
import { useWorkspace } from '../context';
import { getDefaultServerUrl } from '../sdk';

export function useAutoConnect() {
  const store = useWorkspace();

  onMount(() => {
    void store.connect(getDefaultServerUrl());
  });
}
