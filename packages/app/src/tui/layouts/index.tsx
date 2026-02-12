/**
 * Layout Components
 *
 * Semantic layout primitives for the TUI application.
 * These components abstract away the raw box elements and provide
 * meaningful structure to the application layout.
 */

import type { JSX } from 'solid-js';
import { Show } from 'solid-js';
import { useKeybind, useStore } from '../context';
import { rgba, theme } from '../theme';
import { getStatusDisplay } from '../util/status-display';

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
  const statusDisplay = () => getStatusDisplay(store.connectionStatus());
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
        <text fg={rgba(theme.text)}>t-req</text>
        <Show when={activeProfile()}>
          <text fg={rgba(theme.primary)}>[{activeProfile()}]</text>
        </Show>
        <Show when={props.isRunning}>
          <text fg={rgba(theme.warning)}>Running</text>
        </Show>
      </box>
      <box flexDirection="row" gap={2}>
        <box flexDirection="row">
          <text fg={rgba(theme.text)}>ctrl+h</text>
          <text fg={rgba(theme.textMuted)}>hide panel</text>
        </box>
        <box flexDirection="row">
          <text fg={rgba(theme.text)}>{keybind.print('file_picker')}</text>
          <text fg={rgba(theme.textMuted)}> files</text>
        </box>
        <box flexDirection="row">
          <text fg={rgba(theme.text)}>{keybind.print('command_list')}</text>
          <text fg={rgba(theme.textMuted)}> cmds</text>
        </box>
        <box flexDirection="row" gap={1}>
          <text fg={rgba(statusDisplay().color)}>{statusDisplay().icon}</text>
          <text fg={rgba(theme.textMuted)}>{statusDisplay().text}</text>
        </box>
      </box>
    </box>
  );
}
