/**
 * useExecutionDetail Hook
 *
 * Encapsulates execution detail loading when selection changes.
 * Watches selectedReqExecId and execution status, fetches details via SDK.
 */

import type { ExecutionDetail } from '@t-req/sdk/client';
import { type Accessor, createEffect, createSignal, on } from 'solid-js';
import { unwrap, useObserver, useSDK } from '../context';

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
        return {
          id,
          status: exec?.status,
          pluginReportCount: exec?.pluginReports?.length ?? 0
        };
      },
      async ({ id, status: _status, pluginReportCount: _pluginReportCount }) => {
        if (!id) {
          setExecutionDetail(undefined);
          return;
        }

        const flowId = observer.state.flowId;
        if (!flowId) return;

        // Capture values at fetch start to validate response is still relevant
        const fetchFlowId = flowId;
        const fetchExecId = id;

        setLoadingDetail(true);
        try {
          const detail = await unwrap(
            sdk.getFlowsByFlowIdExecutionsByReqExecId({
              path: { flowId, reqExecId: id }
            })
          );

          // Validate state hasn't changed during async fetch (prevents stale data after reset)
          if (
            observer.state.flowId !== fetchFlowId ||
            observer.state.selectedReqExecId !== fetchExecId
          ) {
            return; // State changed, discard this response
          }

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
