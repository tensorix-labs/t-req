import type { JSX } from 'solid-js';

export function AppShell(props: { children: JSX.Element }) {
  return (
    <div class="min-h-screen flex flex-col overflow-hidden">
      {props.children}
    </div>
  );
}
