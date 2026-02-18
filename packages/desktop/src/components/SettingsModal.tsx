import type { TreqClient } from '@t-req/sdk/client';
import { getSettingsModalClasses } from '@t-req/ui';
import { createEffect, createMemo, createSignal, For, onCleanup, Show } from 'solid-js';
import { Portal } from 'solid-js/web';
import { useConfigSummary } from '../hooks/useConfigSummary';
import { toErrorMessage } from '../lib/errors';

type SettingsModalProps = {
  open: boolean;
  client: TreqClient | null;
  onClose: () => void;
};

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M4 4L12 12M12 4L4 12"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
      />
    </svg>
  );
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (value === null) {
    return 'null';
  }

  if (value === undefined) {
    return 'undefined';
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export default function SettingsModal(props: SettingsModalProps) {
  const classes = getSettingsModalClasses();
  const [selectedProfile, setSelectedProfile] = createSignal<string | undefined>(undefined);

  const query = createMemo(() => ({
    enabled: props.open,
    client: props.client,
    profile: selectedProfile()
  }));
  const { config, loading, error, refetch } = useConfigSummary(query);

  const configData = createMemo(() => config());
  const resolvedConfig = createMemo(() => configData()?.resolvedConfig);
  const variableEntries = createMemo(() => Object.entries(resolvedConfig()?.variables ?? {}));
  const warnings = createMemo(() => configData()?.warnings ?? []);
  const pluginPermissions = createMemo(() =>
    Object.entries(resolvedConfig()?.security.pluginPermissions ?? {})
  );

  createEffect(() => {
    if (!props.open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        props.onClose();
      }
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);

    onCleanup(() => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    });
  });

  function handleProfileChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    setSelectedProfile(target.value === '' ? undefined : target.value);
  }

  return (
    <Show when={props.open}>
      <Portal>
        <div class={classes.overlay} onClick={props.onClose} aria-hidden="true" />
        <div class={classes.container} data-theme="treq-desktop">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="desktop-settings-title"
            aria-describedby="desktop-settings-description"
            class={classes.panel}
          >
            <header class={classes.header}>
              <div>
                <h2 id="desktop-settings-title" class={classes.title}>
                  Workspace Configuration
                </h2>
                <p id="desktop-settings-description" class={classes.subtitle}>
                  Read-only config summary loaded from the sidecar server.
                </p>
              </div>
              <button
                type="button"
                class={classes.closeButton}
                onClick={props.onClose}
                aria-label="Close settings"
              >
                <CloseIcon />
              </button>
            </header>

            <div class={classes.body}>
              <div class="space-y-4">
                <section class={classes.section}>
                  <h3 class={classes.sectionTitle}>Profile</h3>
                  <select
                    class={classes.select}
                    value={selectedProfile() ?? ''}
                    onChange={handleProfileChange}
                    disabled={!props.client}
                  >
                    <option value="">None (default)</option>
                    <For each={configData()?.availableProfiles ?? []}>
                      {(profileName) => <option value={profileName}>{profileName}</option>}
                    </For>
                  </select>
                </section>

                <Show when={!props.client}>
                  <section class={classes.section}>
                    <h3 class={classes.sectionTitle}>Server Unavailable</h3>
                    <p class={classes.empty}>Settings can be viewed after the server is ready.</p>
                  </section>
                </Show>

                <Show when={loading()}>
                  <section class={classes.section}>
                    <p class={classes.empty}>Loading configuration...</p>
                  </section>
                </Show>

                <Show when={error()}>
                  <section class={classes.section}>
                    <h3 class={classes.sectionTitle}>Unable to Load Configuration</h3>
                    <p class={classes.empty}>{toErrorMessage(error())}</p>
                    <button type="button" class="btn btn-sm mt-3" onClick={() => void refetch()}>
                      Retry
                    </button>
                  </section>
                </Show>

                <Show when={!loading() && !error() && configData()}>
                  <section class={classes.section}>
                    <h3 class={classes.sectionTitle}>Metadata</h3>
                    <div class={classes.metadataGrid}>
                      <span class={classes.keyCell}>Project root</span>
                      <span class={classes.valueCell}>
                        {configData()?.projectRoot ?? 'unavailable'}
                      </span>
                      <span class={classes.keyCell}>Config path</span>
                      <span class={classes.valueCell}>{configData()?.configPath ?? 'none'}</span>
                      <span class={classes.keyCell}>Format</span>
                      <span class={classes.valueCell}>{configData()?.format ?? 'unknown'}</span>
                      <span class={classes.keyCell}>Resolved profile</span>
                      <span class={classes.valueCell}>{configData()?.profile ?? 'default'}</span>
                    </div>
                  </section>

                  <section class={classes.section}>
                    <h3 class={classes.sectionTitle}>Layers Applied</h3>
                    <Show
                      when={(configData()?.layersApplied?.length ?? 0) > 0}
                      fallback={<p class={classes.empty}>No config layers were reported.</p>}
                    >
                      <div class={classes.codeBlock}>
                        {(configData()?.layersApplied ?? []).join('\n')}
                      </div>
                    </Show>
                  </section>

                  <section class={classes.section}>
                    <h3 class={classes.sectionTitle}>Warnings</h3>
                    <Show
                      when={warnings().length > 0}
                      fallback={<p class={classes.empty}>No warnings.</p>}
                    >
                      <ul class={classes.warningList}>
                        <For each={warnings()}>
                          {(warning) => <li class={classes.warningItem}>{warning}</li>}
                        </For>
                      </ul>
                    </Show>
                  </section>

                  <section class={classes.section}>
                    <h3 class={classes.sectionTitle}>Variables</h3>
                    <Show
                      when={variableEntries().length > 0}
                      fallback={<p class={classes.empty}>No variables configured.</p>}
                    >
                      <div class="space-y-2">
                        <For each={variableEntries()}>
                          {([name, value]) => (
                            <div class={classes.metadataGrid}>
                              <span class={classes.keyCell}>{name}</span>
                              <span class={classes.valueCell}>{formatValue(value)}</span>
                            </div>
                          )}
                        </For>
                      </div>
                    </Show>
                  </section>

                  <section class={classes.section}>
                    <h3 class={classes.sectionTitle}>Defaults</h3>
                    <div class={classes.metadataGrid}>
                      <span class={classes.keyCell}>Timeout (ms)</span>
                      <span class={classes.valueCell}>
                        {resolvedConfig()?.defaults.timeoutMs ?? 'unavailable'}
                      </span>
                      <span class={classes.keyCell}>Follow redirects</span>
                      <span class={classes.valueCell}>
                        {String(resolvedConfig()?.defaults.followRedirects ?? false)}
                      </span>
                      <span class={classes.keyCell}>Validate SSL</span>
                      <span class={classes.valueCell}>
                        {String(resolvedConfig()?.defaults.validateSSL ?? false)}
                      </span>
                      <span class={classes.keyCell}>Proxy</span>
                      <span class={classes.valueCell}>
                        {resolvedConfig()?.defaults.proxy ?? 'none'}
                      </span>
                    </div>
                  </section>

                  <section class={classes.section}>
                    <h3 class={classes.sectionTitle}>Cookies</h3>
                    <div class={classes.metadataGrid}>
                      <span class={classes.keyCell}>Enabled</span>
                      <span class={classes.valueCell}>
                        {String(resolvedConfig()?.cookies.enabled ?? false)}
                      </span>
                      <span class={classes.keyCell}>Mode</span>
                      <span class={classes.valueCell}>
                        {resolvedConfig()?.cookies.mode ?? 'disabled'}
                      </span>
                      <span class={classes.keyCell}>Jar path</span>
                      <span class={classes.valueCell}>
                        {resolvedConfig()?.cookies.jarPath ?? 'none'}
                      </span>
                    </div>
                  </section>

                  <section class={classes.section}>
                    <h3 class={classes.sectionTitle}>Security</h3>
                    <div class={classes.metadataGrid}>
                      <span class={classes.keyCell}>Allow external files</span>
                      <span class={classes.valueCell}>
                        {String(resolvedConfig()?.security.allowExternalFiles ?? false)}
                      </span>
                      <span class={classes.keyCell}>Allow external plugins</span>
                      <span class={classes.valueCell}>
                        {String(resolvedConfig()?.security.allowPluginsOutsideProject ?? false)}
                      </span>
                    </div>
                    <Show when={pluginPermissions().length > 0}>
                      <div class="mt-3 space-y-2">
                        <For each={pluginPermissions()}>
                          {([pluginName, permissions]) => (
                            <div class={classes.metadataGrid}>
                              <span class={classes.keyCell}>{pluginName}</span>
                              <span class={classes.valueCell}>{permissions.join(', ')}</span>
                            </div>
                          )}
                        </For>
                      </div>
                    </Show>
                  </section>
                </Show>
              </div>
            </div>
          </div>
        </div>
      </Portal>
    </Show>
  );
}
