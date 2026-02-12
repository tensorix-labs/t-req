import { createMemo, For, Show } from 'solid-js';
import type { ExecutionResult } from '../../execution/types';
import {
  type AssertCheckReport,
  type AssertSummaryReport,
  isAssertSummaryReport
} from '../../webview/utils/assert';
import { safeJsonStringify } from '../../webview/utils/body';
import { highlightJson } from '../../webview/utils/json-highlight';
import { selectPluginReportRenderer } from '../plugin-report-renderer';

type PluginsTabProps = {
  result: ExecutionResult;
};

type PluginGroup = {
  pluginName: string;
  hooks: ExecutionResult['pluginHooks'];
  reports: ExecutionResult['pluginReports'];
};

function AssertValues(props: { check: AssertCheckReport }) {
  const expected = createMemo(() =>
    props.check.expected !== undefined ? safeJsonStringify(props.check.expected) : ''
  );
  const actual = createMemo(() =>
    props.check.actual !== undefined ? safeJsonStringify(props.check.actual) : ''
  );

  return (
    <Show when={!props.check.passed && (expected() || actual())}>
      <div class="assert-values">
        <Show when={expected()}>
          <div>
            <span class="muted">Expected:</span> <code>{expected()}</code>
          </div>
        </Show>
        <Show when={actual()}>
          <div>
            <span class="muted">Actual:</span> <code>{actual()}</code>
          </div>
        </Show>
      </div>
    </Show>
  );
}

function AssertReport(props: { report: AssertSummaryReport }) {
  const passed = createMemo(() => props.report.total - props.report.failed);
  const summaryClass = createMemo(() =>
    props.report.failed === 0 ? 'assert-pass' : 'assert-fail'
  );

  return (
    <div class="assert-report">
      <div class={`assert-summary ${summaryClass()}`}>
        {passed()}/{props.report.total} passed
      </div>
      <For each={props.report.checks}>
        {(check) => {
          const lineLabel = check.line !== undefined ? `line ${check.line}` : '';
          return (
            <div class={`assert-row ${check.passed ? 'assert-pass' : 'assert-fail'}`}>
              <div class="assert-main">
                <span class="assert-icon">{check.passed ? 'PASS' : 'FAIL'}</span>
                <span class="assert-expression">{check.expression}</span>
                <Show when={lineLabel}>
                  <span class="muted">{lineLabel}</span>
                </Show>
              </div>
              <div class="muted">{check.message || ''}</div>
              <AssertValues check={check} />
            </div>
          );
        }}
      </For>
    </div>
  );
}

function PluginReportData(props: { data: unknown }) {
  const rendererId = createMemo(() => selectPluginReportRenderer(props.data));
  const assertReport = createMemo(() =>
    isAssertSummaryReport(props.data) ? props.data : undefined
  );
  const fallbackJson = createMemo(() => highlightJson(safeJsonStringify(props.data)));

  return (
    <Show
      when={rendererId() === 'assert' && assertReport()}
      fallback={<pre innerHTML={fallbackJson()} />}
    >
      {(report) => <AssertReport report={report()} />}
    </Show>
  );
}

export function PluginsTab(props: PluginsTabProps) {
  const groups = createMemo<PluginGroup[]>(() => {
    const byPlugin = new Map<string, PluginGroup>();

    for (const hook of props.result.pluginHooks) {
      const existing = byPlugin.get(hook.pluginName) ?? {
        pluginName: hook.pluginName,
        hooks: [],
        reports: []
      };
      existing.hooks.push(hook);
      byPlugin.set(hook.pluginName, existing);
    }

    for (const report of props.result.pluginReports) {
      const existing = byPlugin.get(report.pluginName) ?? {
        pluginName: report.pluginName,
        hooks: [],
        reports: []
      };
      existing.reports.push(report);
      byPlugin.set(report.pluginName, existing);
    }

    return [...byPlugin.values()];
  });

  return (
    <>
      <Show when={props.result.warnings.length > 0}>
        <div class="warning-group">
          <For each={props.result.warnings}>
            {(warning) => <div class="warning-item">{warning}</div>}
          </For>
        </div>
      </Show>
      <Show
        when={groups().length > 0}
        fallback={
          <div class="empty">
            {props.result.warnings.length > 0 ? '(no plugin activity)' : '(no plugins active)'}
          </div>
        }
      >
        <For each={groups()}>
          {(group) => (
            <section class="plugin-group">
              <h3>{group.pluginName}</h3>
              <Show
                when={group.hooks.length > 0}
                fallback={<div class="muted">No hooks executed</div>}
              >
                <div class="plugin-subsection">
                  <For each={group.hooks}>
                    {(hook) => (
                      <div class="plugin-hook">
                        <span>{hook.hook}</span>
                        <span class="muted">+{hook.durationMs.toFixed(1)}ms</span>
                        <Show when={hook.modified}>
                          <span class="hook-modified">(mod)</span>
                        </Show>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
              <Show
                when={group.reports.length > 0}
                fallback={<div class="muted">No plugin reports</div>}
              >
                <div class="plugin-subsection">
                  <For each={group.reports}>
                    {(report) => (
                      <div class="plugin-report">
                        <div class="muted">
                          report seq:{report.seq}
                          <Show when={report.requestName}> req:{report.requestName}</Show>
                        </div>
                        <PluginReportData data={report.data} />
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </section>
          )}
        </For>
      </Show>
    </>
  );
}
