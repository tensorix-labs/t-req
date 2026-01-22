/**
 * useExecutionDetail Hook
 *
 * Encapsulates execution detail loading when selection changes.
 * Watches selectedReqExecId and execution status, fetches details via SDK.
 */

import { type Accessor, createEffect, createSignal, on } from 'solid-js';
import { useObserver, useSDK } from '../context';
import type { ExecutionDetail } from '../sdk';

export interface ExecutionDetailReturn {
  detail: Accessor<ExecutionDetail | undefined>;
  isLoading: Accessor<boolean>;
}

export function useExecutionDetail(): ExecutionDetailReturn {
  const sdk = useSDK();
  const observer = useObserver();

  const [loadingDetail, setLoadingDetail] = createSignal(false);
  const [executionDetail, setExecutionDetail] = createSignal<ExecutionDetail | undefined>(
    undefined
  );

  // Load execution detail when selection changes or execution status changes
  createEffect(
    on(
      // Track both the selected ID and the selected execution's status
      () => {
        const id = observer.state.selectedReqExecId;
        const exec = id ? observer.state.executionsById[id] : undefined;
        return { id, status: exec?.status };
      },
      async ({ id, status: _status }) => {
        if (!id) {
          setExecutionDetail(undefined);
          return;
        }

        const flowId = observer.state.flowId;
        if (!flowId) return;

        setLoadingDetail(true);
        try {
          const detail = await sdk.getExecution(flowId, id);
          setExecutionDetail(detail);
        } catch (err) {
          console.error('Failed to load execution detail:', err);
          setExecutionDetail(undefined);
        } finally {
          setLoadingDetail(false);
        }
      },
      { defer: false }
    )
  );

  return {
    detail: executionDetail,
    isLoading: loadingDetail
  };
}
