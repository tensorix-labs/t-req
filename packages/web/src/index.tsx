/* @refresh reload */
import { render } from 'solid-js/web'
import { WorkspaceProvider, ObserverProvider } from './context'
import { createWorkspaceStore } from './stores/workspace'
import { createObserverStore } from './stores/observer'
import './index.css'
import App from './App.tsx'

const root = document.getElementById('root')

const workspaceStore = createWorkspaceStore()
const observerStore = createObserverStore()

render(
  () => (
    <WorkspaceProvider store={workspaceStore}>
      <ObserverProvider store={observerStore}>
        <App />
      </ObserverProvider>
    </WorkspaceProvider>
  ),
  root!
)
