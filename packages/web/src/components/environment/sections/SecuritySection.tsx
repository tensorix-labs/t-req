import { Show, For } from 'solid-js';
import type { SecuritySectionProps } from '../types';
import { SettingRow, ValueBadge, SectionTitle, EmptyState } from '../shared';

export function SecuritySection(props: SecuritySectionProps) {
  const pluginPermissions = () =>
    Object.entries(props.security?.pluginPermissions ?? {}).filter(
      ([, perms]) => perms.length > 0
    );

  return (
    <div class="p-6">
      <Show when={!props.security}>
        <EmptyState message="No security settings configured" />
      </Show>
      <Show when={props.security}>
        <SectionTitle>Security Settings</SectionTitle>
        <div class="mt-4">
          <SettingRow
            label="Allow external files"
            description="Allow loading files from outside the project directory"
            value={<ValueBadge value={props.security!.allowExternalFiles} />}
          />
          <SettingRow
            label="Allow plugins outside project"
            description="Allow loading plugins from outside the project directory"
            value={<ValueBadge value={props.security!.allowPluginsOutsideProject} />}
          />
        </div>

        <Show when={pluginPermissions().length > 0}>
          <div class="mt-8">
            <SectionTitle>Plugin Permissions</SectionTitle>
            <div class="mt-4">
              <For each={pluginPermissions()}>
                {([pluginName, permissions]) => (
                  <SettingRow
                    label={pluginName}
                    value={
                      <span class="text-sm text-treq-text-strong dark:text-treq-dark-text-strong">
                        {permissions.join(', ')}
                      </span>
                    }
                  />
                )}
              </For>
            </div>
          </div>
        </Show>
      </Show>
    </div>
  );
}
