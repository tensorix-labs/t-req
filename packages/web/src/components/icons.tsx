import { Show } from 'solid-js';

export function RefreshIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M13.5 8C13.5 11.0376 11.0376 13.5 8 13.5C4.96243 13.5 2.5 11.0376 2.5 8C2.5 4.96243 4.96243 2.5 8 2.5C9.79493 2.5 11.3855 3.35254 12.3889 4.66667" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M10.5 4.5H13V2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  );
}

export function ChevronIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M4.5 2.5L8 6L4.5 9.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  );
}

export function FolderIcon(props: { open?: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <Show when={props.open} fallback={
        <path d="M2 4.5C2 3.67 2.67 3 3.5 3H6.5L8 4.5H12.5C13.33 4.5 14 5.17 14 6V11.5C14 12.33 13.33 13 12.5 13H3.5C2.67 13 2 12.33 2 11.5V4.5Z" fill="currentColor" opacity="0.7"/>
      }>
        <path d="M2 4.5C2 3.67 2.67 3 3.5 3H6.5L8 4.5H12.5C13.33 4.5 14 5.17 14 6V6.5H2.5C1.67 6.5 1 7.17 1 8V11.5C1 12.33 1.67 13 2.5 13H12.5C13.33 13 14 12.33 14 11.5V6" stroke="currentColor" stroke-width="1.2" fill="none"/>
      </Show>
    </svg>
  );
}

export function FileIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M4 2H9.5L12 4.5V14H4V2Z" stroke="currentColor" stroke-width="1.2"/>
      <path d="M9 2V5H12" stroke="currentColor" stroke-width="1.2"/>
    </svg>
  );
}

export function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M3.5 2.5L11.5 7L3.5 11.5V2.5Z" fill="currentColor" />
    </svg>
  );
}

export function SpinnerIcon(props: { size?: 'sm' | 'md' }) {
  const size = () => props.size === 'sm' ? 12 : 16;
  return (
    <svg
      width={size()}
      height={size()}
      viewBox="0 0 16 16"
      fill="none"
      class="animate-spin"
    >
      <circle
        cx="8"
        cy="8"
        r="6"
        stroke="currentColor"
        stroke-width="2"
        stroke-opacity="0.25"
      />
      <path
        d="M14 8C14 4.68629 11.3137 2 8 2"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
      />
    </svg>
  );
}
