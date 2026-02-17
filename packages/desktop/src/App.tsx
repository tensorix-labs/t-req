import ServerGate from './components/ServerGate';
import { ServerProvider } from './context/server-context';
import { ExplorerScreen } from './features/explorer';

function App() {
  return (
    <ServerProvider>
      <ServerGate>
        <ExplorerScreen />
      </ServerGate>
    </ServerProvider>
  );
}

export default App;
