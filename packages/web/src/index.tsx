/* @refresh reload */
import { createSignal } from 'solid-js'
import { render } from 'solid-js/web'
import { SDKProvider, WorkspaceProvider, ObserverProvider, ScriptRunnerProvider, TestRunnerProvider } from './context'
import { createWorkspaceStore } from './stores/workspace'
import { createObserverStore } from './stores/observer'
import type { SDK } from './sdk'
import '@t-req/ui/fonts'
import './index.css'
import App from './App.tsx'

const root = document.getElementById('root')

render(() => {
  const [sdk, setSdk] = createSignal<SDK | null>(null)
  const workspaceStore = createWorkspaceStore({ sdk, setSdk })
  const observerStore = createObserverStore()

  return (
    <SDKProvider sdk={sdk}>
      <WorkspaceProvider store={workspaceStore}>
        <ObserverProvider store={observerStore}>
          <ScriptRunnerProvider>
            <TestRunnerProvider>
              <App />
            </TestRunnerProvider>
          </ScriptRunnerProvider>
        </ObserverProvider>
      </WorkspaceProvider>
    </SDKProvider>
  )
}, root!)
