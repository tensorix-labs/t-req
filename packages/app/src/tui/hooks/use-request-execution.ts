/**
 * useRequestExecution Hook
 *
 * Orchestrates HTTP request execution - connecting SDK calls to flow subscriptions.
 * Handles the full lifecycle: create flow → subscribe SSE → execute → finish flow.
 * Also handles SSE stream execution for @sse protocol requests.
 */

import { useObserver, useSDK, useStore } from '../context';
import { useFlowSubscription } from './use-flow-subscription';

export interface RequestExecutionReturn {
  /** Execute a specific request by file path and request index */
  executeRequest: (filePath: string, requestIndex: number) => Promise<void>;
  /** Execute a streaming SSE request */
  executeStreamRequest: (
    filePath: string,
    requestIndex: number,
    method: string,
    url: string
  ) => Promise<void>;
  /** Disconnect an active stream */
  disconnectStream: () => void;
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

  /**
   * Execute a streaming SSE request.
   * Connects to the SSE endpoint, streams messages into observer state,
   * and manages the stream lifecycle.
   */
  async function executeStreamRequest(
    filePath: string,
    requestIndex: number,
    method: string,
    url: string
  ) {
    if (isBlocked()) return;

    // Reset observer state for new run
    observer.reset();

    let flowId: string | undefined;
    let unsubscribe: (() => void) | undefined;

    try {
      // Create flow
      const flow = await sdk.createFlow(`SSE stream ${requestIndex} from ${filePath}`);
      flowId = flow.flowId;
      observer.setState('flowId', flowId);

      // Subscribe to flow events
      unsubscribe = flowSubscription.subscribe(flowId);

      // Start stream state
      observer.startStream('sse', method, url);

      // Open SSE connection
      const result = await sdk.streamRequest(flowId, filePath, requestIndex);
      observer.setStreamCloseRef(result.close);

      // Stream messages — mark connected on first successful read
      let connected = false;
      for await (const msg of result.messages) {
        if (!connected) {
          observer.markStreamConnected();
          connected = true;
        }
        observer.addStreamMessage(msg.data, {
          event: msg.event,
          id: msg.id,
          retry: msg.retry
        });
      }

      // Natural end of stream
      observer.endStream('disconnected');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      observer.endStream('error', message);
    } finally {
      // Finish flow
      if (flowId) {
        try {
          await sdk.finishFlow(flowId);
        } catch {
          // Ignore errors
        }
      }
      unsubscribe?.();
    }
  }

  /**
   * Disconnect an active stream.
   */
  function disconnectStream() {
    observer.disconnectStream();
  }

  return {
    executeRequest,
    executeStreamRequest,
    disconnectStream,
    isBlocked
  };
}
