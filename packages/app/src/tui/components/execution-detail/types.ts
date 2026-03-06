import type { ExecutionDetail, GetPluginsResponses } from '@t-req/sdk/client';

export type DetailTab = 'body' | 'headers' | 'plugins' | 'output';
export type LoadedPlugin = GetPluginsResponses[200]['plugins'][number];
export type PluginReport = NonNullable<ExecutionDetail['pluginReports']>[number];

export const DETAIL_TABS = [
  { id: 'body', label: 'body', shortcut: '1' },
  { id: 'headers', label: 'headers', shortcut: '2' },
  { id: 'plugins', label: 'plugins', shortcut: '3' },
  { id: 'output', label: 'output', shortcut: '4' }
] as const;
