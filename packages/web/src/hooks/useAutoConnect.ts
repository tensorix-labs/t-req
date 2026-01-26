import { createEffect } from 'solid-js';
import { useWorkspace } from '../context';
import { getDefaultServerUrl } from '../sdk';

export function useAutoConnect() {
  const store = useWorkspace();

  createEffect(() => {
    store.connect(getDefaultServerUrl());
  });
}
