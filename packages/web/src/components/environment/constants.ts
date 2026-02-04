import { CookieIcon, DefaultsIcon, PluginIcon, ShieldIcon, VariablesIcon } from '../icons';
import type { NavItem } from './types';

export const NAV_ITEMS: NavItem[] = [
  { id: 'variables', label: 'Variables', icon: VariablesIcon },
  { id: 'defaults', label: 'Defaults', icon: DefaultsIcon },
  { id: 'cookies', label: 'Cookies', icon: CookieIcon },
  { id: 'security', label: 'Security', icon: ShieldIcon },
  { id: 'plugins', label: 'Plugins', icon: PluginIcon }
];
