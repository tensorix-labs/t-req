import type { JSX } from 'solid-js';

export interface SectionTitleProps {
  children: JSX.Element;
}

export function SectionTitle(props: SectionTitleProps) {
  return (
    <h3 class="text-xs font-semibold uppercase tracking-wider text-treq-text-muted dark:text-treq-dark-text-muted mb-2">
      {props.children}
    </h3>
  );
}
