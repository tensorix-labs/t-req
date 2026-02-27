import { setupDialogFocusTrap } from '@t-req/ui';
import { createEffect, createMemo, For, onCleanup, Show } from 'solid-js';
import { Portal } from 'solid-js/web';
import type {
  CurlImportConflictPolicy,
  CurlImportDiagnostics,
  CurlImportStats,
  CurlImportSummary
} from '../utils/curl-import';

const CONFLICT_POLICIES: Array<{
  value: CurlImportConflictPolicy;
  label: string;
  description: string;
}> = [
  { value: 'fail', label: 'Fail', description: 'Stop if any destination file already exists.' },
  { value: 'skip', label: 'Skip', description: 'Skip conflicting files and continue.' },
  { value: 'overwrite', label: 'Overwrite', description: 'Replace conflicting files.' },
  { value: 'rename', label: 'Rename', description: 'Write to a suffixed filename instead.' }
];

type CurlImportDialogProps = {
  open: boolean;
  command: string;
  outputDir: string;
  onConflict: CurlImportConflictPolicy;
  fileName: string;
  requestName: string;
  mergeVariables: boolean;
  force: boolean;
  advancedOpen: boolean;
  isPreviewing: boolean;
  isApplying: boolean;
  canApply: boolean;
  previewResult: CurlImportSummary | undefined;
  previewDiagnostics: CurlImportDiagnostics;
  previewStats: CurlImportStats | undefined;
  previewDiagnosticsBlocked: boolean;
  previewError: string | undefined;
  applyResult:
    | {
        kind: 'success' | 'partial';
        summary: CurlImportSummary;
      }
    | undefined;
  applyError: string | undefined;
  onClose: () => void;
  onCommandChange: (value: string) => void;
  onOutputDirChange: (value: string) => void;
  onConflictChange: (value: CurlImportConflictPolicy) => void;
  onFileNameChange: (value: string) => void;
  onRequestNameChange: (value: string) => void;
  onMergeVariablesChange: (checked: boolean) => void;
  onForceChange: (checked: boolean) => void;
  onToggleAdvanced: () => void;
  onPreview: () => void;
  onApply: () => void;
};

function severityClass(severity: CurlImportDiagnostics[number]['severity']): string {
  switch (severity) {
    case 'error':
      return 'badge badge-error badge-xs font-mono';
    case 'warning':
      return 'badge badge-warning badge-xs font-mono';
    default:
      return 'badge badge-info badge-xs font-mono';
  }
}

function SummaryPaths(props: { title: string; paths: string[] }) {
  return (
    <Show when={props.paths.length > 0}>
      <section class="space-y-1">
        <h5 class="m-0 text-xs font-semibold uppercase tracking-[0.04em] text-base-content/70">
          {props.title} ({props.paths.length})
        </h5>
        <ul class="m-0 list-disc space-y-1 pl-5">
          <For each={props.paths}>
            {(path) => <li class="font-mono text-[12px] text-base-content/80">{path}</li>}
          </For>
        </ul>
      </section>
    </Show>
  );
}

function SummaryRenamed(props: { entries: CurlImportSummary['renamed'] }) {
  return (
    <Show when={props.entries.length > 0}>
      <section class="space-y-1">
        <h5 class="m-0 text-xs font-semibold uppercase tracking-[0.04em] text-base-content/70">
          Renamed ({props.entries.length})
        </h5>
        <ul class="m-0 list-disc space-y-1 pl-5">
          <For each={props.entries}>
            {(entry) => (
              <li class="font-mono text-[12px] text-base-content/80">
                {entry.original} {'->'} {entry.actual}
              </li>
            )}
          </For>
        </ul>
      </section>
    </Show>
  );
}

function SummaryFailed(props: { entries: CurlImportSummary['failed'] }) {
  return (
    <Show when={props.entries.length > 0}>
      <section class="space-y-1">
        <h5 class="m-0 text-xs font-semibold uppercase tracking-[0.04em] text-error">
          Failed ({props.entries.length})
        </h5>
        <ul class="m-0 list-disc space-y-1 pl-5">
          <For each={props.entries}>
            {(entry) => (
              <li class="font-mono text-[12px] text-error">
                {entry.path}: {entry.error}
              </li>
            )}
          </For>
        </ul>
      </section>
    </Show>
  );
}

export function CurlImportDialog(props: CurlImportDialogProps) {
  let dialogRef: HTMLDivElement | undefined;

  const isBusy = createMemo(() => props.isPreviewing || props.isApplying);
  const previewDisabled = createMemo(() => isBusy() || props.command.trim().length === 0);
  const applyDisabled = createMemo(() => isBusy() || !props.canApply);
  const hasPreview = createMemo(() => Boolean(props.previewStats || props.previewResult));

  createEffect(() => {
    if (!props.open || !dialogRef) {
      return;
    }

    const cleanupFocusTrap = setupDialogFocusTrap(dialogRef, {
      onRequestClose: props.onClose
    });

    onCleanup(() => {
      cleanupFocusTrap();
    });
  });

  return (
    <Show when={props.open}>
      <Portal>
        <div
          class="modal modal-open"
          role="dialog"
          aria-modal="true"
          aria-labelledby="curl-import-title"
        >
          <div
            ref={dialogRef}
            class="modal-box max-w-4xl border border-base-300 bg-base-100/95 text-base-content shadow-2xl"
            tabIndex={-1}
          >
            <h3
              id="curl-import-title"
              class="font-mono text-[1.12rem] font-semibold tracking-[-0.01em] text-base-content"
            >
              Import cURL
            </h3>
            <p class="mt-1 text-sm text-base-content/65">
              Preview generated files before applying changes to your workspace.
            </p>

            <div class="mt-4 grid gap-4 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
              <div class="space-y-4">
                <label class="form-control gap-1">
                  <span class="label-text font-mono text-[12px] text-base-content/70">
                    cURL command
                  </span>
                  <textarea
                    class="textarea textarea-sm h-36 w-full border-base-300 bg-base-100/70 font-mono text-xs"
                    value={props.command}
                    onInput={(event) => props.onCommandChange(event.currentTarget.value)}
                    placeholder="curl https://api.example.com/users -H 'Authorization: Bearer token'"
                    disabled={isBusy()}
                  />
                </label>

                <label class="form-control gap-1">
                  <span class="label-text font-mono text-[12px] text-base-content/70">
                    Output directory
                  </span>
                  <input
                    type="text"
                    class="input input-sm w-full border-base-300 bg-base-100/70 font-mono text-sm"
                    value={props.outputDir}
                    onInput={(event) => props.onOutputDirChange(event.currentTarget.value)}
                    placeholder="curl-import"
                    disabled={isBusy()}
                  />
                </label>

                <div class="space-y-2 rounded-box border border-base-300 bg-base-200/35 p-3">
                  <button
                    type="button"
                    class="btn btn-ghost btn-xs px-0 font-mono"
                    onClick={props.onToggleAdvanced}
                    disabled={isBusy()}
                  >
                    {props.advancedOpen ? 'Hide advanced options' : 'Show advanced options'}
                  </button>

                  <Show when={props.advancedOpen}>
                    <div class="space-y-3">
                      <label class="form-control gap-1">
                        <span class="label-text font-mono text-[12px] text-base-content/70">
                          Conflict policy
                        </span>
                        <select
                          class="select select-sm w-full border-base-300 bg-base-100/80 font-mono text-sm"
                          value={props.onConflict}
                          onChange={(event) =>
                            props.onConflictChange(
                              event.currentTarget.value as CurlImportConflictPolicy
                            )
                          }
                          disabled={isBusy()}
                        >
                          <For each={CONFLICT_POLICIES}>
                            {(policy) => <option value={policy.value}>{policy.label}</option>}
                          </For>
                        </select>
                        <span class="text-[11px] text-base-content/60">
                          {
                            CONFLICT_POLICIES.find((policy) => policy.value === props.onConflict)
                              ?.description
                          }
                        </span>
                      </label>

                      <label class="form-control gap-1">
                        <span class="label-text font-mono text-[12px] text-base-content/70">
                          File name (optional)
                        </span>
                        <input
                          type="text"
                          class="input input-sm w-full border-base-300 bg-base-100/80 font-mono text-sm"
                          value={props.fileName}
                          onInput={(event) => props.onFileNameChange(event.currentTarget.value)}
                          placeholder="curl-request"
                          disabled={isBusy()}
                        />
                      </label>

                      <label class="form-control gap-1">
                        <span class="label-text font-mono text-[12px] text-base-content/70">
                          Request name (optional)
                        </span>
                        <input
                          type="text"
                          class="input input-sm w-full border-base-300 bg-base-100/80 font-mono text-sm"
                          value={props.requestName}
                          onInput={(event) => props.onRequestNameChange(event.currentTarget.value)}
                          placeholder="curl request"
                          disabled={isBusy()}
                        />
                      </label>

                      <label class="label cursor-pointer justify-start gap-2 px-0">
                        <input
                          type="checkbox"
                          class="checkbox checkbox-sm"
                          checked={props.mergeVariables}
                          onChange={(event) =>
                            props.onMergeVariablesChange(event.currentTarget.checked)
                          }
                          disabled={isBusy()}
                        />
                        <span class="label-text font-mono text-[12px] text-base-content/80">
                          Merge imported variables into config
                        </span>
                      </label>

                      <label class="label cursor-pointer justify-start gap-2 px-0">
                        <input
                          type="checkbox"
                          class="checkbox checkbox-sm"
                          checked={props.force}
                          onChange={(event) => props.onForceChange(event.currentTarget.checked)}
                          disabled={isBusy()}
                        />
                        <span class="label-text font-mono text-[12px] text-base-content/80">
                          Force apply when diagnostics include errors
                        </span>
                      </label>
                    </div>
                  </Show>
                </div>
              </div>

              <div class="min-h-0 space-y-3 rounded-box border border-base-300 bg-base-200/25 p-3">
                <Show when={props.previewError}>
                  {(message) => (
                    <div class="rounded-box border border-error/40 bg-error/10 px-3 py-2 text-sm text-error">
                      {message()}
                    </div>
                  )}
                </Show>

                <Show when={props.applyError}>
                  {(message) => (
                    <div class="rounded-box border border-error/40 bg-error/10 px-3 py-2 text-sm text-error">
                      {message()}
                    </div>
                  )}
                </Show>

                <Show
                  when={hasPreview()}
                  fallback={
                    <div class="rounded-box border border-base-300 bg-base-100/70 px-3 py-2 text-sm text-base-content/70">
                      Run preview to inspect diagnostics and generated file changes.
                    </div>
                  }
                >
                  <section class="space-y-2">
                    <header class="flex flex-wrap items-center gap-2">
                      <h4 class="m-0 text-sm font-semibold text-base-content">Preview</h4>
                      <Show when={props.previewDiagnosticsBlocked}>
                        <span class="badge badge-warning badge-sm font-mono">Force Required</span>
                      </Show>
                      <Show when={!props.previewDiagnosticsBlocked}>
                        <span class="badge badge-success badge-sm font-mono">Ready</span>
                      </Show>
                    </header>
                    <div class="flex flex-wrap items-center gap-2 text-xs">
                      <Show when={props.previewStats}>
                        {(stats) => (
                          <>
                            <span class="badge badge-outline font-mono">
                              {stats().requestCount} request
                            </span>
                            <span class="badge badge-outline font-mono">
                              {stats().fileCount} file
                            </span>
                            <span class="badge badge-outline font-mono">
                              {stats().diagnosticCount} diagnostics
                            </span>
                          </>
                        )}
                      </Show>
                    </div>

                    <Show when={props.previewDiagnostics.length > 0}>
                      <div class="space-y-2 rounded-box border border-base-300 bg-base-100/75 p-2">
                        <h5 class="m-0 text-xs font-semibold uppercase tracking-[0.04em] text-base-content/70">
                          Diagnostics ({props.previewDiagnostics.length})
                        </h5>
                        <ul class="m-0 space-y-2 pl-0">
                          <For each={props.previewDiagnostics}>
                            {(diagnostic) => (
                              <li class="space-y-1 rounded-box border border-base-300/60 bg-base-100 px-2 py-1.5">
                                <div class="flex flex-wrap items-center gap-2">
                                  <span class={severityClass(diagnostic.severity)}>
                                    {diagnostic.severity}
                                  </span>
                                  <span class="font-mono text-[12px] text-base-content/70">
                                    {diagnostic.code}
                                  </span>
                                </div>
                                <p class="m-0 text-[12px] text-base-content/90">
                                  {diagnostic.message}
                                </p>
                                <Show when={diagnostic.sourcePath}>
                                  {(sourcePath) => (
                                    <p class="m-0 font-mono text-[11px] text-base-content/60">
                                      {sourcePath()}
                                    </p>
                                  )}
                                </Show>
                              </li>
                            )}
                          </For>
                        </ul>
                      </div>
                    </Show>

                    <Show when={props.previewResult}>
                      {(summary) => (
                        <div class="space-y-2 rounded-box border border-base-300 bg-base-100/75 p-2">
                          <SummaryPaths title="Would write" paths={summary().written} />
                          <SummaryPaths title="Would skip" paths={summary().skipped} />
                          <SummaryRenamed entries={summary().renamed} />
                          <SummaryFailed entries={summary().failed} />
                          <Show when={summary().variablesMerged}>
                            <p class="m-0 text-[12px] text-success">Variables will be merged.</p>
                          </Show>
                          <Show when={summary().variableMergeInstructions}>
                            {(instructions) => (
                              <pre class="m-0 overflow-auto rounded-box border border-base-300 bg-base-100 p-2 font-mono text-[11px] text-base-content/80 whitespace-pre-wrap">
                                {instructions()}
                              </pre>
                            )}
                          </Show>
                        </div>
                      )}
                    </Show>
                  </section>
                </Show>

                <Show when={props.applyResult}>
                  {(result) => (
                    <section class="space-y-2 rounded-box border border-base-300 bg-base-100/75 p-2">
                      <header class="flex items-center gap-2">
                        <h4 class="m-0 text-sm font-semibold text-base-content">Apply result</h4>
                        <span
                          class={
                            result().kind === 'success'
                              ? 'badge badge-success badge-sm font-mono'
                              : 'badge badge-warning badge-sm font-mono'
                          }
                        >
                          {result().kind === 'success' ? 'Applied' : 'Partial'}
                        </span>
                      </header>
                      <SummaryPaths title="Written" paths={result().summary.written} />
                      <SummaryPaths title="Skipped" paths={result().summary.skipped} />
                      <SummaryRenamed entries={result().summary.renamed} />
                      <SummaryFailed entries={result().summary.failed} />
                      <Show when={result().summary.variablesMerged}>
                        <p class="m-0 text-[12px] text-success">Variables were merged.</p>
                      </Show>
                      <Show when={result().summary.variableMergeInstructions}>
                        {(instructions) => (
                          <pre class="m-0 overflow-auto rounded-box border border-base-300 bg-base-100 p-2 font-mono text-[11px] text-base-content/80 whitespace-pre-wrap">
                            {instructions()}
                          </pre>
                        )}
                      </Show>
                    </section>
                  )}
                </Show>
              </div>
            </div>

            <div class="modal-action mt-5">
              <button
                type="button"
                class="btn btn-ghost btn-sm font-mono text-[12px] normal-case"
                onClick={props.onClose}
                disabled={isBusy()}
              >
                Cancel
              </button>
              <button
                type="button"
                class="btn btn-outline btn-sm font-mono text-[12px] normal-case"
                onClick={props.onPreview}
                disabled={previewDisabled()}
              >
                {props.isPreviewing ? 'Previewing…' : 'Preview'}
              </button>
              <button
                type="button"
                class="btn btn-primary btn-sm rounded-full border border-primary/70 px-5 font-mono text-[12px] font-semibold tracking-[0.01em] normal-case"
                onClick={props.onApply}
                disabled={applyDisabled()}
              >
                {props.isApplying ? 'Applying…' : 'Apply'}
              </button>
            </div>
          </div>
          <button
            type="button"
            class="modal-backdrop"
            onClick={props.onClose}
            aria-label="Close curl import dialog"
          >
            close
          </button>
        </div>
      </Portal>
    </Show>
  );
}
