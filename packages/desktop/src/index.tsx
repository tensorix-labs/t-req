/* @refresh reload */
import { render } from 'solid-js/web';
import '@t-req/ui/fonts';
import './index.css';
import App from './App';

render(() => <App />, document.getElementById('root') as HTMLElement);
