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

export function HttpFileIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.2"/>
      <ellipse cx="8" cy="8" rx="2.5" ry="5.5" stroke="currentColor" stroke-width="1.2"/>
      <path d="M2.5 8H13.5" stroke="currentColor" stroke-width="1.2"/>
    </svg>
  );
}

export function ScriptFileIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M5 4L2 8L5 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M11 4L14 8L11 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M9 3L7 13" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
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

export function HistoryIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 4V8L10.5 10.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M2.5 8C2.5 11.0376 4.96243 13.5 8 13.5C11.0376 13.5 13.5 11.0376 13.5 8C13.5 4.96243 11.0376 2.5 8 2.5C5.79493 2.5 3.88546 3.85254 3.01111 5.75" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M2.5 3V6H5.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  );
}

export function SettingsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
      <path d="M7.62516 4.46094L5.05225 3.86719L3.86475 5.05469L4.4585 7.6276L2.0835 9.21094V10.7943L4.4585 12.3776L3.86475 14.9505L5.05225 16.138L7.62516 15.5443L9.2085 17.9193H10.7918L12.3752 15.5443L14.9481 16.138L16.1356 14.9505L15.5418 12.3776L17.9168 10.7943V9.21094L15.5418 7.6276L16.1356 5.05469L14.9481 3.86719L12.3752 4.46094L10.7918 2.08594H9.2085L7.62516 4.46094Z" stroke="currentColor"/>
      <path d="M12.5002 10.0026C12.5002 11.3833 11.3809 12.5026 10.0002 12.5026C8.61945 12.5026 7.50016 11.3833 7.50016 10.0026C7.50016 8.62189 8.61945 7.5026 10.0002 7.5026C11.3809 7.5026 12.5002 8.62189 12.5002 10.0026Z" stroke="currentColor"/>
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

export function VariablesIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M3 4H13M3 8H10M3 12H7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>
  );
}

export function DefaultsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2.5" y="2.5" width="11" height="11" rx="2" stroke="currentColor" stroke-width="1.2"/>
      <path d="M5 8H11M8 5V11" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
    </svg>
  );
}

export function CookieIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.2"/>
      <circle cx="6" cy="6" r="1" fill="currentColor"/>
      <circle cx="10" cy="7" r="1" fill="currentColor"/>
      <circle cx="7" cy="10" r="1" fill="currentColor"/>
    </svg>
  );
}

export function ShieldIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 2L3 4V7.5C3 10.5 5 13 8 14C11 13 13 10.5 13 7.5V4L8 2Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
    </svg>
  );
}

export function PluginIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M6 2V4H4V6H2V10H4V12H6V14H10V12H12V10H14V6H12V4H10V2H6Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>
  );
}
