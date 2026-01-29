/**
 * useRequestExecution Hook
 *
 * Orchestrates HTTP request execution - connecting SDK calls to flow subscriptions.
 * Handles the full lifecycle: create flow → subscribe SSE → execute → finish flow.
 */

import { useObserver, useSDK, useStore } from '../context';
import { useFlowSubscription } from './use-flow-subscription';

export interface RequestExecutionReturn {
  /** Execute a specific request by file path and request index */
  executeRequest: (filePath: string, requestIndex: number) => Promise<void>;
  /** Check if execution is blocked (e.g., script running) */
  isBlocked: () => boolean;
}

export function useRequestExecution(): RequestExecutionReturn {
  const sdk = useSDK();
  const store = useStore();
  const observer = useObserver();
  const flowSubscription = useFlowSubscription();

  /**
   * Check if request execution is blocked.
   */
  function isBlocked(): boolean {
    return !!observer.state.runningScript;
  }

  /**
   * Execute a specific request by file path and request index.
   * Orchestrates the full flow lifecycle.
   */
  async function executeRequest(filePath: string, requestIndex: number) {
    // Don't allow running while a script is running
    if (isBlocked()) {
      return;
    }

    // Reset observer state for new run
    observer.reset();

    try {
      // Create flow
      const { flowId } = await sdk.createFlow(`Running request ${requestIndex} from ${filePath}`);
      observer.setState('flowId', flowId);

      // Subscribe to SSE events
      const unsubscribe = flowSubscription.subscribe(flowId);

      // Execute the request via SDK with active profile
      const profile = store.activeProfile();
      await sdk.executeRequest(flowId, filePath, requestIndex, profile);

      // Finish flow after request completes
      await sdk.finishFlow(flowId);

      // Unsubscribe from SSE
      unsubscribe();
    } catch (err) {
      console.error('Failed to execute request:', err);
      observer.setState('sseStatus', 'error');
      flowSubscription.unsubscribe();
    }
  }

  return {
    executeRequest,
    isBlocked
  };
}
