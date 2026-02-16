import type { ParentComponent } from 'solid-js';
import { createMemo, Match, Show, Switch } from 'solid-js';
import { useServer } from '../context/server-context';

type StatusPanelProps = {
  title: string;
  message: string;
  detail?: string;
};

function StatusPanel(props: StatusPanelProps) {
  return (
    <main class="container">
      <section class="panel status-panel">
        <h1>{props.title}</h1>
        <p>{props.message}</p>
        <Show when={props.detail}>
          <pre>{props.detail}</pre>
        </Show>
      </section>
    </main>
  );
}

const ServerGate: ParentComponent = (props) => {
  const { status } = useServer();

  const workspacePickingReason = createMemo(() => {
    const current = status();
    if (current.state !== 'picking-workspace') {
      return undefined;
    }

    return current.reason;
  });

  const serverErrorMessage = createMemo(() => {
    const current = status();
    if (current.state !== 'error') {
      return undefined;
    }

    return current.message;
  });

  return (
    <Switch
      fallback={
        <StatusPanel
          title="Starting t-req server..."
          message="Launching sidecar process and waiting for health checks."
        />
      }
    >
      <Match when={status().state === 'ready'}>{props.children}</Match>
      <Match when={status().state === 'picking-workspace'}>
        <StatusPanel
          title="Select a workspace folder"
          message="Use the native folder picker to choose a workspace and continue."
          detail={workspacePickingReason()}
        />
      </Match>
      <Match when={status().state === 'switching'}>
        <StatusPanel
          title="Switching workspace..."
          message="Restarting the sidecar with the new workspace."
        />
      </Match>
      <Match when={status().state === 'error'}>
        <StatusPanel
          title="Unable to start t-req server"
          message="Server initialization failed."
          detail={serverErrorMessage()}
        />
      </Match>
    </Switch>
  );
};

export default ServerGate;
