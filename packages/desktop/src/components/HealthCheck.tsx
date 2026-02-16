import { unwrap } from '@t-req/sdk/client';
import { createMemo, createResource, Match, Switch } from 'solid-js';
import { useServer } from '../context/server-context';
import { toErrorMessage } from '../lib/errors';

export default function HealthCheck() {
  const { client, workspacePath } = useServer();
  const [health, { refetch }] = createResource(async () => {
    const currentClient = client();
    if (!currentClient) {
      throw new Error('SDK client unavailable while server is not ready');
    }

    return unwrap(currentClient.getHealth());
  });

  const healthErrorMessage = createMemo(() => {
    if (!health.error) {
      return undefined;
    }

    return `Health request failed: ${toErrorMessage(health.error)}`;
  });

  return (
    <section class="panel health-panel">
      <h1>t-req desktop</h1>
      <p>Sidecar server is ready and authenticated requests are active.</p>

      <dl class="server-meta">
        <dt>Workspace</dt>
        <dd>{workspacePath() ?? 'unavailable'}</dd>
      </dl>

      <div class="actions">
        <button type="button" onClick={() => void refetch()}>
          Refresh /health
        </button>
      </div>

      <pre>
        <Switch fallback={JSON.stringify(health() ?? {}, null, 2)}>
          <Match when={health.loading}>Loading health response...</Match>
          <Match when={healthErrorMessage()}>{healthErrorMessage()}</Match>
        </Switch>
      </pre>
    </section>
  );
}
