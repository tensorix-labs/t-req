export type AppFooterStatusTone = 'ready' | 'progress' | 'error' | 'idle';

export function getAppFooterClasses(): string {
  return 'h-12 shrink-0 border-t border-base-300 bg-base-100/95 px-4 backdrop-blur-sm';
}

export function getAppFooterInnerClasses(): string {
  return 'mx-auto flex h-full w-full max-w-[1200px] items-center justify-between gap-3';
}

export function getAppFooterPrimaryClasses(): string {
  return 'flex min-w-0 items-center gap-2 text-sm text-base-content';
}

export function getAppFooterWorkspaceClasses(): string {
  return 'truncate font-mono text-xs text-base-content/80';
}

export function getAppFooterActionsClasses(): string {
  return 'flex items-center gap-2';
}

export function getAppFooterStatusClasses(tone: AppFooterStatusTone): string {
  const base = 'rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide';

  switch (tone) {
    case 'ready':
      return `${base} bg-success/20 text-base-content`;
    case 'progress':
      return `${base} bg-warning/20 text-base-content`;
    case 'error':
      return `${base} bg-error/20 text-base-content`;
    default:
      return `${base} bg-base-300 text-base-content`;
  }
}

export function getIconActionButtonClasses(options?: { disabled?: boolean }): string {
  const base = 'btn btn-ghost btn-sm btn-square';
  if (options?.disabled) {
    return `${base} opacity-40 pointer-events-none`;
  }

  return `${base} text-base-content/70 hover:text-base-content`;
}

export type SettingsModalClassNames = {
  overlay: string;
  container: string;
  panel: string;
  header: string;
  title: string;
  subtitle: string;
  closeButton: string;
  body: string;
  section: string;
  sectionTitle: string;
  metadataGrid: string;
  keyCell: string;
  valueCell: string;
  select: string;
  warningList: string;
  warningItem: string;
  codeBlock: string;
  empty: string;
};

export function getSettingsModalClasses(): SettingsModalClassNames {
  return {
    overlay: 'fixed inset-0 z-[120] bg-neutral/45 backdrop-blur-[1px]',
    container: 'pointer-events-none fixed inset-0 z-[121] flex items-center justify-center p-4',
    panel:
      'pointer-events-auto w-full max-w-3xl max-h-[85vh] overflow-hidden rounded-box border border-base-300 bg-base-100 shadow-2xl',
    header: 'flex items-start justify-between gap-4 border-b border-base-300 px-5 py-4',
    title: 'text-base font-semibold text-base-content',
    subtitle: 'mt-1 text-xs text-base-content/70',
    closeButton: 'btn btn-ghost btn-sm btn-square',
    body: 'max-h-[calc(85vh-72px)] overflow-y-auto px-5 py-4',
    section: 'rounded-box border border-base-300 bg-base-200/50 p-4',
    sectionTitle: 'mb-2 text-sm font-semibold text-base-content',
    metadataGrid: 'grid grid-cols-[130px_1fr] gap-x-3 gap-y-2 text-sm',
    keyCell: 'font-medium text-base-content/70',
    valueCell: 'font-mono text-xs text-base-content break-all',
    select:
      'select select-sm w-full border-base-300 bg-base-100 text-base-content focus:outline-none focus:ring-2 focus:ring-primary/30',
    warningList: 'mt-2 space-y-2',
    warningItem:
      'rounded-md border border-warning/35 bg-warning/15 px-3 py-2 text-xs text-base-content',
    codeBlock:
      'rounded-md border border-base-300 bg-base-100 p-3 font-mono text-xs text-base-content whitespace-pre-wrap break-words',
    empty: 'text-xs text-base-content/65'
  };
}
