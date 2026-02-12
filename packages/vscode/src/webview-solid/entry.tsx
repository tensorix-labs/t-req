import { render } from 'solid-js/web';
import { escapeHtml } from '../webview/utils/format';
import { App } from './components/App';
import type { WebviewBootstrapData } from './types';
import './styles.css';

function parseBootstrapData(): WebviewBootstrapData {
  const dataElement = document.getElementById('treq-data');
  if (!dataElement) {
    throw new Error('Missing bootstrap data element.');
  }
  const text = dataElement.textContent ?? '';
  if (!text.trim()) {
    throw new Error('Empty bootstrap data payload.');
  }
  return JSON.parse(text) as WebviewBootstrapData;
}

function mount(): void {
  const root = document.getElementById('root');
  if (!root) {
    throw new Error('Missing root element.');
  }

  const bootstrap = parseBootstrapData();
  render(() => <App result={bootstrap.result} profile={bootstrap.profile} />, root);
}

try {
  mount();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  document.body.innerHTML = `<pre>${escapeHtml(message)}</pre>`;
}
