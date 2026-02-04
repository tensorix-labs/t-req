export interface EmptyStateProps {
  message: string;
}

export function EmptyState(props: EmptyStateProps) {
  return (
    <div class="flex items-center justify-center py-12 text-treq-text-muted dark:text-treq-dark-text-muted">
      {props.message}
    </div>
  );
}
