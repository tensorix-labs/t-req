export interface ValueBadgeProps {
  value: string | number | boolean | undefined | null;
}

export function ValueBadge(props: ValueBadgeProps) {
  const displayValue = () => {
    const v = props.value;
    if (v === undefined || v === null) return '—';
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    return String(v);
  };

  const badgeClasses = () => {
    const v = props.value;
    const base = 'px-3 py-1.5 text-sm rounded-lg font-medium';
    if (typeof v === 'boolean') {
      return v
        ? `${base} bg-http-get/10 text-http-get`
        : `${base} bg-treq-border-light dark:bg-treq-dark-border-light text-treq-text-muted dark:text-treq-dark-text-muted`;
    }
    return `${base} bg-treq-border-light dark:bg-treq-dark-border-light text-treq-text-strong dark:text-treq-dark-text-strong`;
  };

  return <span class={badgeClasses()}>{displayValue()}</span>;
}
