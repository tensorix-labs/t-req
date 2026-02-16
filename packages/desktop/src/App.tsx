import HealthCheck from './components/HealthCheck';
import ServerGate from './components/ServerGate';
import { ServerProvider } from './context/server-context';
import './App.css';

function App() {
  return (
    <ServerProvider>
      <ServerGate>
        <main class="container">
          <HealthCheck />
        </main>
      </ServerGate>
    </ServerProvider>
  );
}

export default App;
