import { isAssertSummaryReport } from '../webview/utils/assert';

export type PluginReportRendererId = 'assert' | 'json';

type PluginReportRendererSelector = {
  id: PluginReportRendererId;
  supports: (data: unknown) => boolean;
};

const RENDERER_ORDER: PluginReportRendererSelector[] = [
  {
    id: 'assert',
    supports: isAssertSummaryReport
  },
  {
    id: 'json',
    supports: () => true
  }
];

export function selectPluginReportRenderer(data: unknown): PluginReportRendererId {
  return RENDERER_ORDER.find((renderer) => renderer.supports(data))?.id ?? 'json';
}
