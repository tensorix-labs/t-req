import type { JSX } from 'solid-js';
import type { PluginInfo, ResolvedCookies, ResolvedDefaults, SecuritySettings } from '../../sdk';

export type SectionType = 'variables' | 'defaults' | 'cookies' | 'security' | 'plugins';

export interface NavItem {
  id: SectionType;
  label: string;
  icon: () => JSX.Element;
}

// Section Props
export interface VariablesSectionProps {
  variables: Record<string, unknown>;
}

export interface DefaultsSectionProps {
  defaults: ResolvedDefaults | undefined;
}

export interface CookiesSectionProps {
  cookies: ResolvedCookies | undefined;
}

export interface SecuritySectionProps {
  security: SecuritySettings | undefined;
}

export interface PluginsSectionProps {
  plugins: PluginInfo[];
}

// Environment Manager Section Configuration
export interface SectionConfig {
  type: SectionType;
  component: (props: SectionRenderProps) => JSX.Element;
}

export interface SectionRenderProps {
  resolvedConfig:
    | {
        variables: Record<string, unknown>;
        defaults: ResolvedDefaults | undefined;
        cookies: ResolvedCookies | undefined;
        security: SecuritySettings | undefined;
      }
    | undefined;
  plugins: PluginInfo[];
}
