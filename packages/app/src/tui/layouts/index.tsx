/**
 * Layout Components
 *
 * Semantic layout primitives for the TUI application.
 * These components abstract away the raw box elements and provide
 * meaningful structure to the application layout.
 */

import type { JSX } from 'solid-js';
import { For, Show } from 'solid-js';
import { Installation } from '../../installation';
import { useKeybind, useStore } from '../context';
import { rgba, theme } from '../theme';
// ============================================================================
// Core Layout Primitives
// ============================================================================

export interface FullScreenLayoutProps {
  children: JSX.Element;
}

/**
 * Full-screen container with theme background.
 */
export function FullScreenLayout(props: FullScreenLayoutProps) {
  return (
    <box flexDirection="column" width="100%" height="100%" backgroundColor={rgba(theme.background)}>
      {props.children}
    </box>
  );
}

export interface SplitPanelProps {
  children: JSX.Element;
}

/**
 * Horizontal split panel container.
 */
export function SplitPanel(props: SplitPanelProps) {
  return (
    <box flexGrow={1} flexDirection="row" overflow="hidden">
      {props.children}
    </box>
  );
}

type BoxDimension = number | 'auto' | `${number}%`;

export interface PanelProps {
  children: JSX.Element;
  width?: BoxDimension;
  flexGrow?: number;
}

/**
 * Vertical panel with stacked children.
 */
export function Panel(props: PanelProps) {
  return (
    <box
      width={props.width}
      flexGrow={props.flexGrow}
      flexShrink={props.width ? 0 : undefined}
      flexDirection="column"
      overflow="hidden"
    >
      {props.children}
    </box>
  );
}

export interface SectionProps {
  children: JSX.Element;
  height?: BoxDimension;
  flexGrow?: number;
}

/**
 * Section within a panel.
 */
export function Section(props: SectionProps) {
  return (
    <box height={props.height} flexGrow={props.flexGrow} overflow="hidden">
      {props.children}
    </box>
  );
}

export interface TabBarTab {
  id: string;
  label: string;
}

export interface TabBarProps {
  tabs: TabBarTab[];
  activeTab: string;
  paddingLeft?: number;
  paddingRight?: number;
  gap?: number;
}

/**
 * Single-line tab bar with active tab highlighting.
 */
export function TabBar(props: TabBarProps) {
  return (
    <box
      height={1}
      flexShrink={0}
      flexDirection="row"
      paddingLeft={props.paddingLeft ?? 2}
      paddingRight={props.paddingRight ?? 2}
      gap={props.gap ?? 2}
    >
      <For each={props.tabs}>
        {(tab) => {
          const isActive = () => props.activeTab === tab.id;

          return (
            <box
              height={1}
              flexDirection="row"
              paddingLeft={1}
              paddingRight={1}
              backgroundColor={isActive() ? rgba(theme.primary) : undefined}
            >
              <text
                fg={rgba(isActive() ? theme.background : theme.textMuted)}
                attributes={isActive() ? 1 : 0}
              >
                {tab.label}
              </text>
            </box>
          );
        }}
      </For>
    </box>
  );
}

// ============================================================================
// Dividers
// ============================================================================

/**
 * Horizontal divider line.
 */
export function HorizontalDivider() {
  return <box height={1} flexShrink={0} backgroundColor={rgba(theme.borderSubtle)} />;
}

/**
 * Vertical divider line.
 */
export function VerticalDivider() {
  return <box width={1} flexShrink={0} backgroundColor={rgba(theme.borderSubtle)} />;
}

// ============================================================================
// Status Bar
// ============================================================================

export interface StatusBarProps {
  isRunning: boolean;
}

/**
 * Application status bar at the bottom.
 */
export function StatusBar(props: StatusBarProps) {
  const keybind = useKeybind();
  const store = useStore();
  const activeProfile = () => store.activeProfile();

  return (
    <box
      height={1}
      flexShrink={0}
      paddingLeft={2}
      paddingRight={2}
      flexDirection="row"
      justifyContent="space-between"
    >
      <box flexDirection="row" gap={2}>
        <Show when={activeProfile()}>
          <text fg={rgba(theme.primary)}>[{activeProfile()}]</text>
        </Show>
        <Show when={props.isRunning}>
          <text fg={rgba(theme.warning)}>Running</text>
        </Show>
        <box flexDirection="row">
          <text fg={rgba(theme.text)}>ctrl+h</text>
          <text fg={rgba(theme.textMuted)}> hide panel</text>
        </box>
        <box flexDirection="row">
          <text fg={rgba(theme.text)}>tab</text>
          <text fg={rgba(theme.textMuted)}> switch tab</text>
        </box>
        <box flexDirection="row">
          <text fg={rgba(theme.text)}>l/h</text>
          <text fg={rgba(theme.textMuted)}> response tabs</text>
        </box>
        <box flexDirection="row">
          <text fg={rgba(theme.text)}>{keybind.print('file_picker')}</text>
          <text fg={rgba(theme.textMuted)}> files</text>
        </box>
        <box flexDirection="row">
          <text fg={rgba(theme.text)}>{keybind.print('command_list')}</text>
          <text fg={rgba(theme.textMuted)}> cmds</text>
        </box>
      </box>
      <text fg={rgba(theme.textMuted)}>v{Installation.VERSION}</text>
    </box>
  );
}
