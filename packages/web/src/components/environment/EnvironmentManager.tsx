import type { JSX } from 'solid-js';
import { createSignal } from 'solid-js';
import { Portal } from 'solid-js/web';
import { useConnection, useWorkspace } from '../../context';
import { useAccessibleDialog, useEnvironmentData } from '../../hooks';
import type { PluginInfo, ResolvedCookies, ResolvedDefaults, SecuritySettings } from '../../sdk';
import { CloseIcon } from '../icons';
import { EnvironmentContent } from './EnvironmentContent';
import { Sidebar } from './Sidebar';
import {
  CookiesSection,
  DefaultsSection,
  PluginsSection,
  SecuritySection,
  VariablesSection
} from './sections';
import type { SectionConfig, SectionRenderProps, SectionType } from './types';

export interface EnvironmentManagerProps {
  onClose: () => void;
}

// Section components with proper typing
const VariablesSectionWrapper = (props: { variables: Record<string, unknown> }): JSX.Element => (
  <VariablesSection variables={props.variables} />
);

const DefaultsSectionWrapper = (props: { defaults: ResolvedDefaults | undefined }): JSX.Element => (
  <DefaultsSection defaults={props.defaults} />
);

const CookiesSectionWrapper = (props: { cookies: ResolvedCookies | undefined }): JSX.Element => (
  <CookiesSection cookies={props.cookies} />
);

const SecuritySectionWrapper = (props: { security: SecuritySettings | undefined }): JSX.Element => (
  <SecuritySection security={props.security} />
);

const PluginsSectionWrapper = (props: { plugins: PluginInfo[] }): JSX.Element => (
  <PluginsSection plugins={props.plugins} />
);

// Declarative section configuration
const SECTIONS: SectionConfig[] = [
  {
    type: 'variables',
    component: (props: SectionRenderProps) => (
      <VariablesSectionWrapper variables={props.resolvedConfig?.variables ?? {}} />
    )
  },
  {
    type: 'defaults',
    component: (props: SectionRenderProps) => (
      <DefaultsSectionWrapper defaults={props.resolvedConfig?.defaults} />
    )
  },
  {
    type: 'cookies',
    component: (props: SectionRenderProps) => (
      <CookiesSectionWrapper cookies={props.resolvedConfig?.cookies} />
    )
  },
  {
    type: 'security',
    component: (props: SectionRenderProps) => (
      <SecuritySectionWrapper security={props.resolvedConfig?.security} />
    )
  },
  {
    type: 'plugins',
    component: (props: SectionRenderProps) => <PluginsSectionWrapper plugins={props.plugins} />
  }
];

function getSectionComponent(type: SectionType): (props: SectionRenderProps) => JSX.Element {
  const section = SECTIONS.find((s) => s.type === type);
  if (!section) {
    throw new Error(`Unknown section type: ${type}`);
  }
  return section.component;
}

function EnvironmentManager(props: EnvironmentManagerProps) {
  const store = useWorkspace();
  const connection = useConnection();
  const [activeSection, setActiveSection] = createSignal<SectionType>('variables');
  const [previewProfile, setPreviewProfile] = createSignal(store.activeProfile());

  let dialogRef: HTMLDivElement | undefined;

  useAccessibleDialog({
    containerRef: () => dialogRef,
    onEscape: props.onClose,
    autoFocus: true,
    restoreFocus: true,
    preventBodyScroll: true
  });

  const { refetch, resolvedConfig, pluginsResponse, loading, error } = useEnvironmentData(
    () => connection.client,
    () => previewProfile()
  );

  const currentSectionComponent = () => getSectionComponent(activeSection());

  return (
    <Portal>
      <div class="fixed inset-0 bg-black/50 z-[100]" onClick={props.onClose} aria-hidden="true" />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="env-manager-title"
        aria-describedby="env-manager-desc"
        class="fixed inset-0 z-[101] flex items-center justify-center p-4 pointer-events-none"
      >
        <span id="env-manager-desc" class="sr-only">
          View environment configuration including variables, defaults, cookies, security settings,
          and plugins.
        </span>
        <div class="bg-white dark:bg-treq-dark-bg rounded-xl shadow-2xl w-full max-w-4xl h-[600px] max-h-[80vh] flex pointer-events-auto overflow-hidden animate-fade-scale-in">
          <Sidebar
            activeSection={activeSection()}
            onSectionChange={setActiveSection}
            previewProfile={previewProfile()}
            onProfileChange={setPreviewProfile}
            availableProfiles={store.availableProfiles()}
            pluginCount={pluginsResponse()?.count}
          />

          <main class="flex-1 flex flex-col min-w-0">
            <header class="flex items-center justify-between px-6 py-4 border-b border-treq-border-light dark:border-treq-dark-border-light">
              <h2
                id="env-manager-title"
                class="text-lg font-semibold text-treq-text-strong dark:text-treq-dark-text-strong capitalize"
              >
                {activeSection()}
              </h2>
              <button
                type="button"
                class="p-2 rounded-lg text-treq-text-muted hover:bg-treq-border-light dark:hover:bg-treq-dark-border-light transition-colors"
                onClick={props.onClose}
                aria-label="Close"
              >
                <CloseIcon />
              </button>
            </header>

            <div class="flex-1 overflow-y-auto">
              <EnvironmentContent loading={loading()} error={error()} onRetry={refetch}>
                {currentSectionComponent()({
                  resolvedConfig: resolvedConfig(),
                  plugins: pluginsResponse()?.plugins ?? []
                })}
              </EnvironmentContent>
            </div>
          </main>
        </div>
      </div>
    </Portal>
  );
}

export { EnvironmentManager };
export default EnvironmentManager;
